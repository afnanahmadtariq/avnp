import type { Business, JobSpecification } from "@relay/contracts";

import type { ProviderRequestContext, ProviderResult } from "./result.js";

export interface BusinessSearchRequest {
  readonly job: JobSpecification;
  readonly limit: number;
  readonly searchRadiusKm: number;
}

export interface BusinessDirectoryProvider {
  readonly name: string;

  search(
    request: BusinessSearchRequest,
    context: ProviderRequestContext,
  ): Promise<ProviderResult<readonly Business[]>>;
}
