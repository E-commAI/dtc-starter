"use client"

import { shopBrand } from "@lib/branding"
import LocalizedClientLink from "@modules/common/components/localized-client-link"

type StoreBrandLinkProps = {
  className?: string
  "data-testid"?: string
  href?: string
}

const StoreBrandLink = ({
  className,
  href = "/",
  ...props
}: StoreBrandLinkProps) => {
  return (
    <LocalizedClientLink
      href={href}
      className={className}
      aria-label={shopBrand.name}
      {...props}
    >
      {shopBrand.logo ? (
        <img
          src={shopBrand.logo}
          alt=""
          className="h-6 w-auto max-w-[160px] object-contain"
        />
      ) : (
        shopBrand.name
      )}
    </LocalizedClientLink>
  )
}

export default StoreBrandLink
