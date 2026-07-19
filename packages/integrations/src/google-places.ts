import type { Address, Business } from "@relay/contracts";

import type {
  BusinessDirectoryProvider,
  BusinessSearchRequest,
} from "./business-directory.js";
import {
  fetchProvider,
  isFiniteNumber,
  isRecord,
  isString,
  providerFailure,
  readJson,
  requestSignal,
  systemClock,
  type FetchLike,
  type ProviderClock,
} from "./http.js";
import type { ProviderRequestContext, ProviderResult } from "./result.js";

const PROVIDER_NAME = "google-places";
const DEFAULT_API_BASE_URL = "https://places.googleapis.com/v1";

const PLACE_FIELDS = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.postalAddress",
  "places.location",
  "places.internationalPhoneNumber",
  "places.rating",
  "places.userRatingCount",
  "places.websiteUri",
  "places.types",
] as const;

export interface GooglePlacesConfig {
  readonly apiKey: string;
  readonly apiBaseUrl?: string;
  readonly languageCode?: string;
  readonly regionCode?: string;
}

export interface GooglePlacesDependencies {
  readonly clock?: ProviderClock;
  readonly fetch?: FetchLike;
}

interface GooglePlace {
  readonly displayName?: unknown;
  readonly formattedAddress?: unknown;
  readonly id?: unknown;
  readonly internationalPhoneNumber?: unknown;
  readonly location?: unknown;
  readonly postalAddress?: unknown;
  readonly rating?: unknown;
  readonly types?: unknown;
  readonly userRatingCount?: unknown;
  readonly websiteUri?: unknown;
}

function normalizePhoneNumber(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed.startsWith("+")) {
    return undefined;
  }

  const normalized = `+${trimmed.slice(1).replace(/\D/g, "")}`;
  return /^\+[1-9]\d{7,14}$/.test(normalized) ? normalized : undefined;
}

function optionalString(value: unknown): string | undefined {
  return isString(value) && value.trim().length > 0 ? value.trim() : undefined;
}

function placeAddress(place: GooglePlace): Address | undefined {
  const formattedAddress = optionalString(place.formattedAddress);
  if (formattedAddress === undefined) {
    return undefined;
  }

  const postal = isRecord(place.postalAddress)
    ? place.postalAddress
    : undefined;
  const location = isRecord(place.location) ? place.location : undefined;
  const addressLines = Array.isArray(postal?.addressLines)
    ? postal.addressLines.filter(isString)
    : [];
  const latitude = location?.latitude;
  const longitude = location?.longitude;
  const coordinates =
    isFiniteNumber(latitude) && isFiniteNumber(longitude)
      ? { latitude, longitude }
      : undefined;
  const countryCode = optionalString(postal?.regionCode)?.toUpperCase();

  return {
    formattedAddress,
    ...(addressLines[0] === undefined ? {} : { line1: addressLines[0] }),
    ...(addressLines[1] === undefined ? {} : { line2: addressLines[1] }),
    ...(optionalString(postal?.locality) === undefined
      ? {}
      : { city: optionalString(postal?.locality) }),
    ...(optionalString(postal?.administrativeArea) === undefined
      ? {}
      : { region: optionalString(postal?.administrativeArea) }),
    ...(optionalString(postal?.postalCode) === undefined
      ? {}
      : { postalCode: optionalString(postal?.postalCode) }),
    ...(countryCode !== undefined && /^[A-Z]{2}$/.test(countryCode)
      ? { countryCode }
      : {}),
    ...(coordinates === undefined ? {} : { coordinates }),
    ...(optionalString(place.id) === undefined
      ? {}
      : { placeId: optionalString(place.id) }),
  };
}

function toBusiness(
  place: GooglePlace,
  distanceMeters: number | undefined,
): Business | undefined {
  const externalId = optionalString(place.id);
  const displayName = isRecord(place.displayName)
    ? optionalString(place.displayName.text)
    : undefined;
  const phone = isString(place.internationalPhoneNumber)
    ? normalizePhoneNumber(place.internationalPhoneNumber)
    : undefined;
  const location = placeAddress(place);

  if (
    externalId === undefined ||
    displayName === undefined ||
    phone === undefined ||
    location === undefined
  ) {
    return undefined;
  }

  const rating = isFiniteNumber(place.rating) ? place.rating : undefined;
  const reviewCount = isFiniteNumber(place.userRatingCount)
    ? Math.max(0, Math.trunc(place.userRatingCount))
    : undefined;
  const websiteUrl = optionalString(place.websiteUri);
  const categories = Array.isArray(place.types)
    ? place.types.filter(isString).slice(0, 50)
    : undefined;

  return {
    id: `google:${externalId}`,
    name: displayName,
    phone,
    location,
    source: "directory",
    externalId,
    ...(rating === undefined ? {} : { rating }),
    ...(reviewCount === undefined ? {} : { reviewCount }),
    ...(distanceMeters === undefined
      ? {}
      : { distanceMeters: Math.max(0, Math.trunc(distanceMeters)) }),
    ...(websiteUrl === undefined ? {} : { websiteUrl }),
    ...(categories === undefined ? {} : { categories }),
  };
}

export class GooglePlacesBusinessDirectory implements BusinessDirectoryProvider {
  readonly name = PROVIDER_NAME;

  readonly #apiBaseUrl: string;
  readonly #apiKey: string;
  readonly #clock: ProviderClock;
  readonly #fetch: FetchLike;
  readonly #languageCode: string;
  readonly #regionCode: string | undefined;

  constructor(
    config: GooglePlacesConfig,
    dependencies: GooglePlacesDependencies = {},
  ) {
    this.#apiKey = config.apiKey.trim();
    this.#apiBaseUrl = (config.apiBaseUrl ?? DEFAULT_API_BASE_URL).replace(
      /\/$/,
      "",
    );
    this.#languageCode = config.languageCode ?? "en";
    this.#regionCode = config.regionCode;
    this.#fetch = dependencies.fetch ?? fetch;
    this.#clock = dependencies.clock ?? systemClock;
  }

  async search(
    request: BusinessSearchRequest,
    context: ProviderRequestContext,
  ): Promise<ProviderResult<readonly Business[]>> {
    if (this.#apiKey.length === 0) {
      return providerFailure(
        this.name,
        "misconfigured",
        "Google Places requires a server API key.",
        false,
      );
    }
    if (
      !Number.isFinite(request.limit) ||
      request.limit < 1 ||
      !Number.isFinite(request.searchRadiusKm) ||
      request.searchRadiusKm <= 0
    ) {
      return providerFailure(
        this.name,
        "misconfigured",
        "Google Places search limit and radius must be positive numbers.",
        false,
      );
    }

    const origin = request.job.pickupAddress.coordinates;
    const includeRouting = origin !== undefined;
    const fields = includeRouting
      ? [...PLACE_FIELDS, "routingSummaries.distanceMeters"]
      : [...PLACE_FIELDS];
    const maxResultCount = Math.min(20, Math.max(1, Math.trunc(request.limit)));
    const radiusMeters = Math.min(
      50_000,
      Math.max(1, Math.round(request.searchRadiusKm * 1_000)),
    );
    const body = {
      textQuery: `moving companies near ${request.job.pickupAddress.formattedAddress}`,
      maxResultCount,
      languageCode: this.#languageCode,
      includePureServiceAreaBusinesses: true,
      ...(this.#regionCode === undefined
        ? {}
        : { regionCode: this.#regionCode }),
      ...(origin === undefined
        ? {}
        : {
            locationBias: {
              circle: { center: origin, radius: radiusMeters },
            },
            routingParameters: { origin },
          }),
    };
    const response = await fetchProvider(
      this.name,
      this.#fetch,
      `${this.#apiBaseUrl}/places:searchText`,
      {
        body: JSON.stringify(body),
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": this.#apiKey,
          "X-Goog-FieldMask": fields.join(","),
        },
        method: "POST",
        signal: requestSignal(context, this.#clock),
      },
    );
    if (!response.ok) {
      return response;
    }

    const decoded = await readJson(this.name, response.value);
    if (!decoded.ok) {
      return decoded;
    }
    if (!isRecord(decoded.value) || !Array.isArray(decoded.value.places)) {
      return providerFailure(
        this.name,
        "invalid-response",
        "Google Places returned an unexpected search payload.",
        false,
      );
    }

    const routingSummaries = Array.isArray(decoded.value.routingSummaries)
      ? decoded.value.routingSummaries
      : [];
    const businesses: Business[] = [];
    for (const [index, value] of decoded.value.places.entries()) {
      if (!isRecord(value)) {
        continue;
      }

      const routing = routingSummaries[index];
      const distanceMeters = isRecord(routing)
        ? routing.distanceMeters
        : undefined;
      const business = toBusiness(
        value,
        isFiniteNumber(distanceMeters) ? distanceMeters : undefined,
      );
      if (business !== undefined) {
        businesses.push(business);
      }
    }

    return { ok: true, value: businesses.slice(0, maxResultCount) };
  }
}
