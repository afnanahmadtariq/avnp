<script setup lang="ts">
import { computed, onMounted, watch } from "vue";
import { UserButton } from "@clerk/nuxt/components";
import { useAuth } from "@clerk/nuxt/composables";

import { useAccountIdentity } from "../../composables/useAccountIdentity";

const route = useRoute();
const runtimeConfig = useRuntimeConfig();
const clerkEnabled = computed(
  () => runtimeConfig.public.authProvider === "clerk",
);
const clerkAuth = clerkEnabled.value ? useAuth() : undefined;
const api = useRelayApi();
const { publicId, runId } = useRequestContext();
const { clearCurrent } = useCurrentRequest();
const hasCurrentRequest = computed(() => publicId.value.length > 0);
const {
  displayName,
  initials,
  isLoaded: accountIdentityLoaded,
  resetAccountIdentity,
  syncAccountIdentity,
} = useAccountIdentity();
const activeAccountId = useState("relay-active-account-id", () => "");
const accountOwnerStorageKey = "relay-account-owner";

interface NavItem {
  label: string;
  mobileLabel?: string;
  to: string;
  icon:
    | "home"
    | "plus"
    | "brief"
    | "business"
    | "call"
    | "report"
    | "profile"
    | "security"
    | "settings";
}

const workspaceItems: NavItem[] = [
  { label: "Dashboard", mobileLabel: "Home", to: "/dashboard", icon: "home" },
  { label: "New request", mobileLabel: "New", to: "/start", icon: "plus" },
];

const requestBase = computed(
  () => `/requests/${encodeURIComponent(publicId.value)}`,
);

const workspaceRoute = computed(() => ({
  path: `${requestBase.value}/workspace`,
  ...(runId.value ? { query: { run: runId.value } } : {}),
}));

const requestItems = computed<NavItem[]>(() => [
  { label: "Brief", to: `${requestBase.value}/review`, icon: "brief" },
  {
    label: "Businesses",
    to: `${requestBase.value}/businesses`,
    icon: "business",
  },
  {
    label: "Calls",
    to: workspaceRoute.value.path,
    icon: "call",
  },
  { label: "Report", to: `${requestBase.value}/report`, icon: "report" },
]);

const accountItems = computed<NavItem[]>(() => [
  { label: "Profile", to: "/profile", icon: "profile" },
  ...(clerkEnabled.value
    ? [
        {
          label: "Sign-in & security",
          to: "/account",
          icon: "security" as const,
        },
      ]
    : []),
  { label: "Settings", to: "/settings", icon: "settings" },
]);

function isActive(item: NavItem): boolean {
  return (
    route.path === item.to ||
    (item.icon === "security" && route.path.startsWith("/account/"))
  );
}

function isMobileParent(item: NavItem): boolean {
  return (
    (item.icon === "brief" &&
      route.path === `${requestBase.value}/businesses`) ||
    (item.icon === "profile" &&
      (route.path === "/settings" || route.path.startsWith("/account")))
  );
}

function itemTarget(item: NavItem) {
  return item.icon === "call" ? workspaceRoute.value : item.to;
}

function isMobileHidden(item: NavItem): boolean {
  if (item.icon === "plus") return hasCurrentRequest.value;
  return ["business", "security", "settings"].includes(item.icon);
}

async function loadAccountIdentity(force = false): Promise<void> {
  if (route.path === "/profile" || (!force && accountIdentityLoaded.value)) {
    return;
  }

  try {
    syncAccountIdentity(await api.getProfile());
  } catch {
    return;
  }
}

async function synchronizeAccountOwner(): Promise<void> {
  if (typeof window === "undefined" || !clerkAuth?.isLoaded.value) return;

  const nextAccountId = clerkAuth.userId.value ?? "";
  const storedAccountId = window.localStorage.getItem(accountOwnerStorageKey);

  if (!activeAccountId.value && storedAccountId === nextAccountId) {
    activeAccountId.value = nextAccountId;
    await loadAccountIdentity();
    return;
  }

  const accountChanged =
    storedAccountId !== nextAccountId ||
    (Boolean(activeAccountId.value) && activeAccountId.value !== nextAccountId);

  if (!accountChanged) return;

  clearCurrent();
  resetAccountIdentity();
  activeAccountId.value = nextAccountId;
  window.localStorage.setItem(accountOwnerStorageKey, nextAccountId);

  if (nextAccountId) await loadAccountIdentity(true);
}

if (clerkAuth) {
  watch(
    [clerkAuth.isLoaded, clerkAuth.userId],
    () => void synchronizeAccountOwner(),
    { flush: "post" },
  );
}

onMounted(async () => {
  if (clerkEnabled.value) await synchronizeAccountOwner();
  else await loadAccountIdentity();
});
</script>

<template>
  <div class="app-shell">
    <header class="app-header">
      <NuxtLink
        aria-label="Relay dashboard"
        class="app-header__brand"
        to="/dashboard"
      >
        <RelayLogo />
      </NuxtLink>
      <div class="app-header__context">
        <span class="app-header__context-dot" aria-hidden="true" />
        {{ clerkEnabled ? "Secure workspace" : "Local workspace" }}
      </div>
      <UserButton v-if="clerkEnabled" after-sign-out-url="/" />
      <NuxtLink
        v-else
        aria-label="Open profile"
        class="app-header__profile"
        to="/profile"
      >
        <span class="app-header__profile-copy"
          ><strong>{{ displayName }}</strong
          ><small>Personal account</small></span
        >
        <span aria-hidden="true" class="app-avatar">{{ initials }}</span>
      </NuxtLink>
    </header>

    <aside class="app-sidebar">
      <nav aria-label="Product navigation">
        <div class="nav-group">
          <p>Workspace</p>
          <NuxtLink
            v-for="item in workspaceItems"
            :key="item.to"
            class="app-nav-link"
            :class="{
              'app-nav-link--active': isActive(item),
              'app-nav-link--mobile-hidden': isMobileHidden(item),
              'app-nav-link--mobile-parent': isMobileParent(item),
            }"
            :to="item.to"
          >
            <span aria-hidden="true" class="app-nav-icon">
              <svg v-if="item.icon === 'home'" viewBox="0 0 20 20">
                <path
                  d="M3 8.5 10 3l7 5.5V17a1 1 0 0 1-1 1h-4v-5H8v5H4a1 1 0 0 1-1-1V8.5Z"
                />
              </svg>
              <svg v-else viewBox="0 0 20 20">
                <path d="M10 3v14M3 10h14" />
              </svg>
            </span>
            <span class="app-nav-label">{{ item.label }}</span>
            <span class="app-nav-label app-nav-label--mobile">{{
              item.mobileLabel ?? item.label
            }}</span>
          </NuxtLink>
        </div>

        <div v-if="hasCurrentRequest" class="nav-group">
          <div class="nav-group__heading">
            <p>Current request</p>
            <span>{{ publicId }}</span>
          </div>
          <NuxtLink
            v-for="item in requestItems"
            :key="item.to"
            class="app-nav-link"
            :class="{
              'app-nav-link--active': isActive(item),
              'app-nav-link--mobile-hidden': isMobileHidden(item),
              'app-nav-link--mobile-parent': isMobileParent(item),
            }"
            :to="itemTarget(item)"
          >
            <span aria-hidden="true" class="app-nav-icon">
              <svg v-if="item.icon === 'brief'" viewBox="0 0 20 20">
                <path d="M5 2.75h7l3 3V17.25H5V2.75Z" />
                <path d="M12 2.75v3h3M7.5 9h5M7.5 12h5" />
              </svg>
              <svg v-else-if="item.icon === 'business'" viewBox="0 0 20 20">
                <path d="M3 17h14M5 17V8h10v9M4 8l2-5h8l2 5M8 11h4M8 14h4" />
              </svg>
              <svg v-else-if="item.icon === 'call'" viewBox="0 0 20 20">
                <path
                  d="M6.2 3.2 8 6.8 6.5 8.3a12 12 0 0 0 5.2 5.2l1.5-1.5 3.6 1.8-.7 3.2a2 2 0 0 1-2 .8A12.9 12.9 0 0 1 2.2 5.9a2 2 0 0 1 .8-2l3.2-.7Z"
                />
              </svg>
              <svg v-else viewBox="0 0 20 20">
                <path d="M4 16V9M8 16V5M12 16v-3M16 16V2" />
              </svg>
            </span>
            <span class="app-nav-label">{{ item.label }}</span>
            <span class="app-nav-label app-nav-label--mobile">{{
              item.mobileLabel ?? item.label
            }}</span>
          </NuxtLink>
        </div>

        <div class="nav-group nav-group--account">
          <p>Account</p>
          <NuxtLink
            v-for="item in accountItems"
            :key="item.to"
            class="app-nav-link"
            :class="{
              'app-nav-link--active': isActive(item),
              'app-nav-link--mobile-hidden': isMobileHidden(item),
              'app-nav-link--mobile-parent': isMobileParent(item),
            }"
            :to="item.to"
          >
            <span aria-hidden="true" class="app-nav-icon">
              <svg v-if="item.icon === 'profile'" viewBox="0 0 20 20">
                <circle cx="10" cy="7" r="3.25" />
                <path d="M4.5 17c.4-3.1 2.2-4.8 5.5-4.8s5.1 1.7 5.5 4.8" />
              </svg>
              <svg v-else-if="item.icon === 'settings'" viewBox="0 0 20 20">
                <circle cx="10" cy="10" r="2.6" />
                <path
                  d="m10 2 .9 2.2 2.2.9 2.2-.9.6.6-.9 2.3.9 2.2 2.1.9v.8l-2.1.9-.9 2.2.9 2.3-.6.6-2.2-.9-2.2.9L10 18l-.9-2.2-2.2-.9-2.2.9-.6-.6.9-2.3-.9-2.2L2 9.8V9l2.1-.9.9-2.2-.9-2.3.6-.6 2.2.9 2.2-.9L10 2Z"
                />
              </svg>
              <svg v-else viewBox="0 0 20 20">
                <rect x="3.5" y="8" width="13" height="9" rx="2" />
                <path d="M6.5 8V6a3.5 3.5 0 0 1 7 0v2M10 11.5v2" />
              </svg>
            </span>
            <span class="app-nav-label">{{ item.label }}</span>
            <span class="app-nav-label app-nav-label--mobile">{{
              item.mobileLabel ?? item.label
            }}</span>
          </NuxtLink>
        </div>
      </nav>

      <div class="sidebar-trust">
        <span aria-hidden="true">✓</span>
        <div>
          <strong>You stay in control</strong>
          <p>Relay never books without confirmation.</p>
        </div>
      </div>
    </aside>

    <div class="app-content"><slot /></div>
  </div>
</template>

<style scoped>
.app-shell {
  background: var(--relay-canvas-app);
  min-height: 100vh;
  padding-left: 232px;
  padding-top: 68px;
}
.app-header {
  align-items: center;
  background: rgb(255 255 255 / 96%);
  border-bottom: 1px solid var(--relay-line);
  display: grid;
  grid-template-columns: 232px 1fr auto;
  height: 68px;
  left: 0;
  padding: 0 24px;
  position: fixed;
  right: 0;
  top: 0;
  z-index: 60;
}
.app-header__brand {
  width: fit-content;
}
.app-header__context {
  align-items: center;
  color: var(--relay-muted);
  display: flex;
  font-size: var(--relay-text-meta);
  gap: 8px;
}
.app-header__context-dot {
  background: var(--relay-green);
  border-radius: 999px;
  height: 7px;
  width: 7px;
}
.app-header__profile {
  align-items: center;
  border-radius: 10px;
  display: flex;
  gap: 10px;
  padding: 5px;
}
.app-header__profile:hover {
  background: var(--relay-surface-muted);
}
.app-header__profile-copy {
  display: grid;
  justify-items: end;
}
.app-header__profile-copy strong {
  font-size: var(--relay-text-meta);
  font-weight: 600;
}
.app-header__profile-copy small {
  color: var(--relay-faint);
  font-size: var(--relay-text-meta);
}
.app-avatar {
  align-items: center;
  background: var(--relay-ink);
  border-radius: 9px;
  color: white;
  display: inline-flex;
  font-size: var(--relay-text-meta);
  font-weight: 650;
  height: 32px;
  justify-content: center;
  width: 32px;
}
.app-sidebar {
  background: #fff;
  border-right: 1px solid var(--relay-line);
  bottom: 0;
  display: flex;
  flex-direction: column;
  left: 0;
  padding: 24px 14px 18px;
  position: fixed;
  top: 68px;
  width: 232px;
  z-index: 40;
}
.app-sidebar nav {
  display: grid;
  gap: 24px;
}
.nav-group {
  display: grid;
  gap: 4px;
}
.nav-group > p,
.nav-group__heading p {
  color: var(--relay-faint);
  font-size: var(--relay-text-meta);
  font-weight: 650;
  letter-spacing: 0.09em;
  margin: 0 10px 7px;
  text-transform: uppercase;
}
.nav-group__heading {
  align-items: center;
  display: flex;
  justify-content: space-between;
}
.nav-group__heading span {
  color: var(--relay-faint);
  font-size: var(--relay-text-meta);
  margin-right: 9px;
}
.nav-group--account {
  margin-top: 2px;
}
.app-nav-link {
  align-items: center;
  border-radius: 9px;
  color: var(--relay-muted);
  display: grid;
  font-size: var(--relay-text-meta);
  font-weight: 540;
  gap: 10px;
  grid-template-columns: 19px 1fr auto;
  min-height: 39px;
  padding: 0 10px;
  transition:
    background 0.15s ease,
    color 0.15s ease;
}
.app-nav-link:hover {
  background: #f6f7f9;
  color: var(--relay-ink);
}
.app-nav-link--active {
  background: var(--relay-blue-soft);
  color: var(--relay-blue);
  font-weight: 620;
}
.app-nav-icon {
  display: block;
  height: 18px;
  width: 18px;
}
.app-nav-icon svg {
  fill: none;
  height: 18px;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.5;
  width: 18px;
}
.sidebar-trust {
  align-items: flex-start;
  background: #f3faf6;
  border: 1px solid #d9eee3;
  border-radius: 12px;
  display: flex;
  gap: 9px;
  margin-top: auto;
  padding: 12px;
}
.sidebar-trust > span {
  align-items: center;
  background: var(--relay-green);
  border-radius: 99px;
  color: white;
  display: inline-flex;
  flex: 0 0 auto;
  font-size: var(--relay-text-meta);
  height: 18px;
  justify-content: center;
  width: 18px;
}
.sidebar-trust strong {
  display: block;
  font-size: var(--relay-text-meta);
  font-weight: 620;
}
.sidebar-trust p {
  color: var(--relay-muted);
  font-size: var(--relay-text-meta);
  line-height: var(--relay-leading-meta);
  margin: 3px 0 0;
}
.app-content {
  container-name: app-content;
  container-type: inline-size;
  min-width: 0;
}
.app-nav-label--mobile {
  display: none;
}
@media (max-width: 1024px) {
  .app-shell {
    padding-bottom: calc(72px + env(safe-area-inset-bottom));
    padding-left: 0;
    padding-top: 64px;
  }
  .app-header {
    grid-template-columns: 1fr auto;
    height: 64px;
  }
  .app-header__context,
  .app-header__profile-copy {
    display: none;
  }
  .app-sidebar {
    border-right: 0;
    border-top: 1px solid var(--relay-line);
    bottom: 0;
    box-shadow: 0 -8px 28px rgb(15 16 20 / 5%);
    padding: 6px 10px calc(6px + env(safe-area-inset-bottom));
    right: 0;
    top: auto;
    width: auto;
  }
  .app-sidebar nav {
    display: grid;
    gap: 0;
    grid-template-columns: repeat(auto-fit, minmax(0, 1fr));
    width: 100%;
  }
  .nav-group,
  .nav-group--account {
    display: contents;
  }
  .nav-group > p,
  .nav-group__heading,
  .sidebar-trust,
  .app-nav-link--mobile-hidden {
    display: none;
  }
  .app-nav-link {
    align-content: center;
    display: flex;
    flex-direction: column;
    font-size: var(--relay-text-meta);
    gap: 2px;
    justify-content: center;
    min-height: 54px;
    padding: 4px 2px;
  }
  .app-sidebar .app-nav-link--mobile-hidden {
    display: none;
  }
  .app-nav-link--mobile-parent {
    background: var(--relay-blue-soft);
    color: var(--relay-blue);
    font-weight: 620;
  }
  .app-nav-icon,
  .app-nav-icon svg {
    height: 19px;
    width: 19px;
  }
  .app-nav-label {
    display: none;
  }
  .app-nav-label--mobile {
    display: inline;
  }
}
@media (max-width: 640px) {
  .app-header {
    padding: 0 16px;
  }
  .app-header__profile {
    padding-right: 0;
  }
}
</style>
