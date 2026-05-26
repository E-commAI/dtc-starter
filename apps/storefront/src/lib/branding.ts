const DEFAULT_SHOP_NAME = "Medusa Store"

export const shopBrand = {
  name: process.env.NEXT_PUBLIC_SHOP_NAME?.trim() || DEFAULT_SHOP_NAME,
  logo: process.env.NEXT_PUBLIC_SHOP_LOGO?.trim() || "",
  favicon: process.env.NEXT_PUBLIC_SHOP_FAVICON?.trim() || "/favicon.ico",
}

export const getBrandedTitle = (title: string) => `${title} | ${shopBrand.name}`
