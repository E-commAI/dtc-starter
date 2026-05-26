import { Metadata } from "next"

import { shopBrand } from "@lib/branding"
import LoginTemplate from "@modules/account/templates/login-template"

export const metadata: Metadata = {
  title: "Sign in",
  description: `Sign in to your ${shopBrand.name} account.`,
}

export default function Login() {
  return <LoginTemplate />
}
