import type { RelayProfile } from "~/types/api";

import { computed } from "vue";

interface AccountIdentity {
  displayName: string;
  representedAs: string;
}

const fallbackIdentity: AccountIdentity = {
  displayName: "Relay member",
  representedAs: "the account holder",
};

export function useAccountIdentity() {
  const identity = useState<AccountIdentity>("relay-account-identity", () => ({
    ...fallbackIdentity,
  }));
  const isLoaded = useState<boolean>(
    "relay-account-identity-loaded",
    () => false,
  );

  const displayName = computed(
    () => identity.value.displayName.trim() || fallbackIdentity.displayName,
  );
  const representedAs = computed(
    () => identity.value.representedAs.trim() || displayName.value,
  );
  const firstName = computed(
    () => displayName.value.split(/\s+/)[0] || fallbackIdentity.displayName,
  );
  const initials = computed(() => {
    const value = displayName.value
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("");

    return value || "R";
  });

  function syncAccountIdentity(
    profile: Pick<RelayProfile, "displayName" | "representedAs">,
  ): void {
    identity.value = {
      displayName: profile.displayName.trim() || fallbackIdentity.displayName,
      representedAs:
        profile.representedAs.trim() ||
        profile.displayName.trim() ||
        fallbackIdentity.representedAs,
    };
    isLoaded.value = true;
  }

  return {
    displayName,
    firstName,
    initials,
    isLoaded,
    representedAs,
    syncAccountIdentity,
  };
}
