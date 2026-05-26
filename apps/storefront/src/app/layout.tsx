import { shopBrand } from "@lib/branding"
import { getBaseURL } from "@lib/util/env"
import { Metadata } from "next"
import "styles/globals.css"

export const metadata: Metadata = {
  metadataBase: new URL(getBaseURL()),
  title: {
    default: shopBrand.name,
    template: `%s | ${shopBrand.name}`,
  },
  applicationName: shopBrand.name,
  icons: {
    icon: shopBrand.favicon,
    shortcut: shopBrand.favicon,
  },
}

export default function RootLayout(props: { children: React.ReactNode }) {
  return (
    <html lang="en" data-mode="light">
      <body>
        <main className="relative">{props.children}</main>
      </body>
    </html>
  )
}
