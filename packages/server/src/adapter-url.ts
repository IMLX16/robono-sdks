export function adapterNetworksUrl(adapterMountUrl: string) {
  const value = adapterMountUrl.trim().replace(/\/+$/, "");
  if (!value) throw new Error("ROBONO_ADAPTER_URL is required.");
  return `${value}/networks`;
}
