import path from "node:path";
import { defineConfig, loadEnv } from "@medusajs/framework/utils";

loadEnv(process.env.NODE_ENV || "development", process.cwd());

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const adminBrandingPlugin = () => ({
  name: "dtc-admin-branding",
  transformIndexHtml(html: string) {
    const shopName = process.env.ADMIN_SHOP_NAME || process.env.SHOP_NAME;
    const faviconPath = process.env.ADMIN_FAVICON_PATH;
    let brandedHtml = html;

    if (shopName) {
      const titleTag = `<title>${escapeHtml(shopName)}</title>`;

      brandedHtml = brandedHtml.includes("<title>")
        ? brandedHtml.replace(/<title>.*?<\/title>/, titleTag)
        : brandedHtml.replace(
          "</head>",
          `            ${titleTag}\n        </head>`,
        );
    }

    if (faviconPath) {
      brandedHtml = brandedHtml.replace(
        '<link rel="icon" href="data:," data-placeholder-favicon />',
        `<link rel="icon" href="${escapeHtml(faviconPath)}" />`,
      );
    }

    return brandedHtml;
  },
});

module.exports = defineConfig({
  admin: {
    vite: () => ({
      publicDir: path.resolve(process.cwd(), "src/admin/public"),
      plugins: [adminBrandingPlugin()],
    }),
  },
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL,
    databaseName: process.env.DB_NAME,
    http: {
      storeCors: process.env.STORE_CORS!,
      adminCors: process.env.ADMIN_CORS!,
      authCors: process.env.AUTH_CORS!,
      jwtSecret: process.env.JWT_SECRET || "supersecret",
      cookieSecret: process.env.COOKIE_SECRET || "supersecret",
    },
  },
});
