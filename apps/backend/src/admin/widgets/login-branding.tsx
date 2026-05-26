import { defineWidgetConfig } from "@medusajs/admin-sdk";
import { Text } from "@medusajs/ui";

declare const process: {
  env: Record<string, string | undefined>;
};

const shopName = process.env.SHOP_NAME || "Medusa Store";
const logoPath = process.env.SHOP_LOGO || "";

const LoginBranding = () => {
  if (!shopName && !logoPath) {
    return null;
  }

  return (
    <div className="mb-2 flex flex-col items-center gap-y-2 text-center">
      {logoPath && (
        <img
          src={logoPath}
          alt=""
          className="max-h-10 max-w-[160px] object-contain"
        />
      )}
      <Text size="small" className="text-ui-fg-subtle">
        {shopName}
      </Text>
    </div>
  );
};

export const config = defineWidgetConfig({
  zone: "login.before",
});

export default LoginBranding;
