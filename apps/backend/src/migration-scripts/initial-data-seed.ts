import { MedusaContainer } from "@medusajs/framework";
import {
  ContainerRegistrationKeys,
  ModuleRegistrationName,
  Modules,
  ProductStatus,
} from "@medusajs/framework/utils";
import {
  createApiKeysWorkflow,
  createCollectionsWorkflow,
  createInventoryLevelsWorkflow,
  createProductCategoriesWorkflow,
  createProductsWorkflow,
  createRegionsWorkflow,
  createSalesChannelsWorkflow,
  createShippingOptionsWorkflow,
  createShippingProfilesWorkflow,
  createStockLocationsWorkflow,
  createStoresWorkflow,
  linkSalesChannelsToApiKeyWorkflow,
  linkSalesChannelsToStockLocationWorkflow,
} from "@medusajs/medusa/core-flows";

type MarketId = "us" | "uk" | "eu" | "ca" | "au";

type ShopMarket = {
  name: string;
  languageCode: string;
  currencyCode: string;
  cookieRegion: string;
  notes: string;
};

type MarketSeeder = {
  market: ShopMarket;
  countries: string[];
  warehouse: {
    name: string;
    city: string;
    countryCode: string;
  };
  productAmount: number;
  shippingAmount: number;
};

type SelectedMarketSeeder = MarketSeeder & {
  id: MarketId;
};

const DEFAULT_MARKET_ID: MarketId = "eu";

const MARKET_SEEDERS: Record<MarketId, MarketSeeder> = {
  us: {
    market: {
      name: "United States",
      languageCode: "en-US",
      currencyCode: "USD",
      cookieRegion: "CCPA",
      notes: "English storefront, US dollar pricing.",
    },
    countries: ["us"],
    warehouse: {
      name: "United States Warehouse",
      city: "New York",
      countryCode: "US",
    },
    productAmount: 15,
    shippingAmount: 10,
  },
  uk: {
    market: {
      name: "United Kingdom",
      languageCode: "en-GB",
      currencyCode: "GBP",
      cookieRegion: "UK GDPR",
      notes: "British English, pound sterling.",
    },
    countries: ["gb"],
    warehouse: {
      name: "United Kingdom Warehouse",
      city: "London",
      countryCode: "GB",
    },
    productAmount: 12,
    shippingAmount: 8,
  },
  eu: {
    market: {
      name: "European Union",
      languageCode: "en-EU",
      currencyCode: "EUR",
      cookieRegion: "EU GDPR",
      notes: "Euro pricing, stronger consent.",
    },
    countries: [
      "at",
      "be",
      "bg",
      "hr",
      "cy",
      "cz",
      "dk",
      "ee",
      "fi",
      "fr",
      "de",
      "gr",
      "hu",
      "ie",
      "it",
      "lv",
      "lt",
      "lu",
      "mt",
      "nl",
      "pl",
      "pt",
      "ro",
      "sk",
      "si",
      "es",
      "se",
    ],
    warehouse: {
      name: "European Union Warehouse",
      city: "Berlin",
      countryCode: "DE",
    },
    productAmount: 10,
    shippingAmount: 10,
  },
  ca: {
    market: {
      name: "Canada",
      languageCode: "en-CA",
      currencyCode: "CAD",
      cookieRegion: "PIPEDA",
      notes: "Canadian defaults, bilingual room.",
    },
    countries: ["ca"],
    warehouse: {
      name: "Canada Warehouse",
      city: "Toronto",
      countryCode: "CA",
    },
    productAmount: 20,
    shippingAmount: 14,
  },
  au: {
    market: {
      name: "Australia",
      languageCode: "en-AU",
      currencyCode: "AUD",
      cookieRegion: "AU Privacy Act",
      notes: "Australian storefront defaults.",
    },
    countries: ["au"],
    warehouse: {
      name: "Australia Warehouse",
      city: "Sydney",
      countryCode: "AU",
    },
    productAmount: 22,
    shippingAmount: 15,
  },
};

const getMarketSeeders = (): SelectedMarketSeeder[] => {
  const requestedMarkets = (
    process.env.SEED_MARKETS ||
    process.env.SEED_MARKET ||
    process.env.MARKETS ||
    process.env.MARKET ||
    DEFAULT_MARKET_ID
  )
    .split(",")
    .map((market) => market.trim().toLowerCase())
    .filter(Boolean);

  if (!requestedMarkets.length) {
    throw new Error(
      `No markets provided. Expected one or more of: ${
        Object.keys(
          MARKET_SEEDERS,
        ).join(", ")
      }.`,
    );
  }

  const marketIds = requestedMarkets.reduce<MarketId[]>((ids, market) => {
    if (!(market in MARKET_SEEDERS)) {
      throw new Error(
        `Unsupported market "${market}". Expected one of: ${
          Object.keys(
            MARKET_SEEDERS,
          ).join(", ")
        }.`,
      );
    }

    const id = market as MarketId;

    if (!ids.includes(id)) {
      ids.push(id);
    }

    return ids;
  }, []);

  return marketIds.map((id) => ({
    id,
    ...MARKET_SEEDERS[id],
  }));
};

const getShopName = (primaryMarketSeeder: SelectedMarketSeeder) => {
  return (
    process.env.SEED_SHOP_NAME ||
    process.env.SHOP_NAME ||
    `${primaryMarketSeeder.market.name} Store`
  );
};

const getMarketMetadata = (marketSeeder: SelectedMarketSeeder) => {
  const market = marketSeeder.market;

  return {
    market_id: marketSeeder.id,
    market_name: market.name,
    language_code: market.languageCode,
    currency_code: market.currencyCode,
    cookie_region: market.cookieRegion,
    notes: market.notes,
  };
};

export default async function initial_data_seed({
  container,
}: {
  container: MedusaContainer;
}) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const link = container.resolve(ContainerRegistrationKeys.LINK);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const fulfillmentModuleService = container.resolve(
    ModuleRegistrationName.FULFILLMENT,
  );
  const taxModuleService = container.resolve(Modules.TAX) as any;

  const marketSeeders = getMarketSeeders();
  const primaryMarketSeeder = marketSeeders[0];
  const shopName = getShopName(primaryMarketSeeder);
  const marketsMetadata = marketSeeders.map((marketSeeder) =>
    getMarketMetadata(marketSeeder)
  );
  const productPrices = marketSeeders.reduce<
    { amount: number; currency_code: string }[]
  >((prices, marketSeeder) => {
    const currencyCode = marketSeeder.market.currencyCode.toLowerCase();

    if (!prices.some((price) => price.currency_code === currencyCode)) {
      prices.push({
        amount: marketSeeder.productAmount,
        currency_code: currencyCode,
      });
    }

    return prices;
  }, []);
  const variantPrices = () =>
    productPrices.map((price) => ({
      ...price,
    }));

  logger.info(
    `Using market seeders: ${
      marketSeeders
        .map(
          (marketSeeder) =>
            `${marketSeeder.id} (${marketSeeder.market.currencyCode})`,
        )
        .join(", ")
    }. Shop name: ${shopName}.`,
  );

  logger.info("Seeding store data...");
  const {
    result: [defaultSalesChannel],
  } = await createSalesChannelsWorkflow(container).run({
    input: {
      salesChannelsData: [
        {
          name: "Default Sales Channel",
          description: "Created by Medusa",
        },
      ],
    },
  });

  const {
    result: [publishableApiKey],
  } = await createApiKeysWorkflow(container).run({
    input: {
      api_keys: [
        {
          title: "Default Publishable API Key",
          type: "publishable",
          created_by: "",
        },
      ],
    },
  });

  await linkSalesChannelsToApiKeyWorkflow(container).run({
    input: {
      id: publishableApiKey.id,
      add: [defaultSalesChannel.id],
    },
  });

  await createStoresWorkflow(container).run({
    input: {
      stores: [
        {
          name: shopName,
          supported_currencies: productPrices.map((price, index) => ({
            currency_code: price.currency_code,
            is_default: index === 0,
          })),
          default_sales_channel_id: defaultSalesChannel.id,
          metadata: {
            shop_name: shopName,
            market_ids: marketSeeders.map((marketSeeder) => marketSeeder.id),
            markets: marketsMetadata,
          },
        },
      ],
    },
  });

  logger.info("Seeding region data...");
  const { result: regions } = await createRegionsWorkflow(container).run({
    input: {
      regions: marketSeeders.map((marketSeeder) => ({
        name: marketSeeder.market.name,
        currency_code: marketSeeder.market.currencyCode.toLowerCase(),
        countries: marketSeeder.countries,
        payment_providers: ["pp_system_default"],
        metadata: getMarketMetadata(marketSeeder),
      })),
    },
  });
  const regionsByMarketId = new Map(
    marketSeeders.map((marketSeeder, index) => [
      marketSeeder.id,
      regions[index],
    ]),
  );
  logger.info("Finished seeding regions.");

  //TODO: this hangs the setup.sh seeding
  // logger.info("Seeding tax regions...");
  // await taxModuleService.createTaxRegions_(
  //   marketSeeders.flatMap((marketSeeder) => marketSeeder.countries).map((country_code) => ({
  //     country_code,
  //     provider_id: "tp_system",
  //   }))
  // );
  // logger.info("Finished seeding tax regions.");

  logger.info("Seeding stock location data...");
  const { result: stockLocationResult } = await createStockLocationsWorkflow(
    container,
  ).run({
    input: {
      locations: marketSeeders.map((marketSeeder) => ({
        name: marketSeeder.warehouse.name,
        address: {
          city: marketSeeder.warehouse.city,
          country_code: marketSeeder.warehouse.countryCode,
          address_1: "",
        },
      })),
    },
  });
  const stockLocationsByMarketId = new Map(
    marketSeeders.map((marketSeeder, index) => [
      marketSeeder.id,
      stockLocationResult[index],
    ]),
  );

  for (const stockLocation of stockLocationResult) {
    await link.create({
      [Modules.STOCK_LOCATION]: {
        stock_location_id: stockLocation.id,
      },
      [Modules.FULFILLMENT]: {
        fulfillment_provider_id: "manual_manual",
      },
    });
  }

  logger.info("Seeding fulfillment data...");
  // This is created by a migration script in core.
  const { data: shippingProfileResult } = await query.graph({
    entity: "shipping_profile",
    fields: ["id"],
  });
  const shippingProfile = shippingProfileResult[0];

  for (const marketSeeder of marketSeeders) {
    const market = marketSeeder.market;
    const countries = marketSeeder.countries;
    const currencyCode = market.currencyCode.toLowerCase();
    const region = regionsByMarketId.get(marketSeeder.id)!;
    const stockLocation = stockLocationsByMarketId.get(marketSeeder.id)!;

    const fulfillmentSet = await fulfillmentModuleService.createFulfillmentSets(
      {
        name: `${marketSeeder.warehouse.name} delivery`,
        type: "shipping",
        service_zones: [
          {
            name: market.name,
            geo_zones: countries.map((country_code) => ({
              country_code,
              type: "country" as const,
            })),
          },
        ],
      },
    );

    await link.create({
      [Modules.STOCK_LOCATION]: {
        stock_location_id: stockLocation.id,
      },
      [Modules.FULFILLMENT]: {
        fulfillment_set_id: fulfillmentSet.id,
      },
    });

    await createShippingOptionsWorkflow(container).run({
      input: [
        {
          name: "Standard Shipping",
          price_type: "flat",
          provider_id: "manual_manual",
          service_zone_id: fulfillmentSet.service_zones[0].id,
          shipping_profile_id: shippingProfile.id,
          type: {
            label: "Standard",
            description: "Ship in 2-3 days.",
            code: "standard",
          },
          prices: [
            {
              currency_code: currencyCode,
              amount: marketSeeder.shippingAmount,
            },
            {
              region_id: region.id,
              amount: marketSeeder.shippingAmount,
            },
          ],
          rules: [
            {
              attribute: "enabled_in_store",
              value: "true",
              operator: "eq",
            },
            {
              attribute: "is_return",
              value: "false",
              operator: "eq",
            },
          ],
        },
        {
          name: "Express Shipping",
          price_type: "flat",
          provider_id: "manual_manual",
          service_zone_id: fulfillmentSet.service_zones[0].id,
          shipping_profile_id: shippingProfile.id,
          type: {
            label: "Express",
            description: "Ship in 24 hours.",
            code: "express",
          },
          prices: [
            {
              currency_code: currencyCode,
              amount: marketSeeder.shippingAmount,
            },
            {
              region_id: region.id,
              amount: marketSeeder.shippingAmount,
            },
          ],
          rules: [
            {
              attribute: "enabled_in_store",
              value: "true",
              operator: "eq",
            },
            {
              attribute: "is_return",
              value: "false",
              operator: "eq",
            },
          ],
        },
      ],
    });

    await linkSalesChannelsToStockLocationWorkflow(container).run({
      input: {
        id: stockLocation.id,
        add: [defaultSalesChannel.id],
      },
    });
  }

  logger.info("Finished seeding fulfillment data.");
  logger.info("Finished seeding stock location data.");

  logger.info("Seeding product data...");

  const { result: categoryResult } = await createProductCategoriesWorkflow(
    container,
  ).run({
    input: {
      product_categories: [
        {
          name: "Shirts",
          is_active: true,
        },
        {
          name: "Sweatshirts",
          is_active: true,
        },
        {
          name: "Pants",
          is_active: true,
        },
        {
          name: "Merch",
          is_active: true,
        },
      ],
    },
  });

  await createProductsWorkflow(container).run({
    input: {
      products: [
        {
          title: "Medusa T-Shirt",
          category_ids: [
            categoryResult.find((cat) => cat.name === "Shirts")!.id,
          ],
          description:
            "Reimagine the feeling of a classic T-shirt. With our cotton T-shirts, everyday essentials no longer have to be ordinary.",
          handle: "t-shirt",
          weight: 400,
          status: ProductStatus.PUBLISHED,
          shipping_profile_id: shippingProfile.id,
          images: [
            {
              url:
                "https://medusa-public-images.s3.eu-west-1.amazonaws.com/tee-black-front.png",
            },
            {
              url:
                "https://medusa-public-images.s3.eu-west-1.amazonaws.com/tee-black-back.png",
            },
            {
              url:
                "https://medusa-public-images.s3.eu-west-1.amazonaws.com/tee-white-front.png",
            },
            {
              url:
                "https://medusa-public-images.s3.eu-west-1.amazonaws.com/tee-white-back.png",
            },
          ],
          options: [
            {
              title: "Size",
              values: ["S", "M", "L", "XL"],
            },
            {
              title: "Color",
              values: ["Black", "White"],
            },
          ],
          variants: [
            {
              title: "S / Black",
              sku: "SHIRT-S-BLACK",
              options: {
                Size: "S",
                Color: "Black",
              },
              prices: variantPrices(),
            },
            {
              title: "S / White",
              sku: "SHIRT-S-WHITE",
              options: {
                Size: "S",
                Color: "White",
              },
              prices: variantPrices(),
            },
            {
              title: "M / Black",
              sku: "SHIRT-M-BLACK",
              options: {
                Size: "M",
                Color: "Black",
              },
              prices: variantPrices(),
            },
            {
              title: "M / White",
              sku: "SHIRT-M-WHITE",
              options: {
                Size: "M",
                Color: "White",
              },
              prices: variantPrices(),
            },
            {
              title: "L / Black",
              sku: "SHIRT-L-BLACK",
              options: {
                Size: "L",
                Color: "Black",
              },
              prices: variantPrices(),
            },
            {
              title: "L / White",
              sku: "SHIRT-L-WHITE",
              options: {
                Size: "L",
                Color: "White",
              },
              prices: variantPrices(),
            },
            {
              title: "XL / Black",
              sku: "SHIRT-XL-BLACK",
              options: {
                Size: "XL",
                Color: "Black",
              },
              prices: variantPrices(),
            },
            {
              title: "XL / White",
              sku: "SHIRT-XL-WHITE",
              options: {
                Size: "XL",
                Color: "White",
              },
              prices: variantPrices(),
            },
          ],
          sales_channels: [
            {
              id: defaultSalesChannel.id,
            },
          ],
        },
        {
          title: "Medusa Sweatshirt",
          category_ids: [
            categoryResult.find((cat) => cat.name === "Sweatshirts")!.id,
          ],
          description:
            "Reimagine the feeling of a classic sweatshirt. With our cotton sweatshirt, everyday essentials no longer have to be ordinary.",
          handle: "sweatshirt",
          weight: 400,
          status: ProductStatus.PUBLISHED,
          shipping_profile_id: shippingProfile.id,
          images: [
            {
              url:
                "https://medusa-public-images.s3.eu-west-1.amazonaws.com/sweatshirt-vintage-front.png",
            },
            {
              url:
                "https://medusa-public-images.s3.eu-west-1.amazonaws.com/sweatshirt-vintage-back.png",
            },
          ],
          options: [
            {
              title: "Size",
              values: ["S", "M", "L", "XL"],
            },
          ],
          variants: [
            {
              title: "S",
              sku: "SWEATSHIRT-S",
              options: {
                Size: "S",
              },
              prices: variantPrices(),
            },
            {
              title: "M",
              sku: "SWEATSHIRT-M",
              options: {
                Size: "M",
              },
              prices: variantPrices(),
            },
            {
              title: "L",
              sku: "SWEATSHIRT-L",
              options: {
                Size: "L",
              },
              prices: variantPrices(),
            },
            {
              title: "XL",
              sku: "SWEATSHIRT-XL",
              options: {
                Size: "XL",
              },
              prices: variantPrices(),
            },
          ],
          sales_channels: [
            {
              id: defaultSalesChannel.id,
            },
          ],
        },
        {
          title: "Medusa Sweatpants",
          category_ids: [
            categoryResult.find((cat) => cat.name === "Pants")!.id,
          ],
          description:
            "Reimagine the feeling of classic sweatpants. With our cotton sweatpants, everyday essentials no longer have to be ordinary.",
          handle: "sweatpants",
          weight: 400,
          status: ProductStatus.PUBLISHED,
          shipping_profile_id: shippingProfile.id,
          images: [
            {
              url:
                "https://medusa-public-images.s3.eu-west-1.amazonaws.com/sweatpants-gray-front.png",
            },
            {
              url:
                "https://medusa-public-images.s3.eu-west-1.amazonaws.com/sweatpants-gray-back.png",
            },
          ],
          options: [
            {
              title: "Size",
              values: ["S", "M", "L", "XL"],
            },
          ],
          variants: [
            {
              title: "S",
              sku: "SWEATPANTS-S",
              options: {
                Size: "S",
              },
              prices: variantPrices(),
            },
            {
              title: "M",
              sku: "SWEATPANTS-M",
              options: {
                Size: "M",
              },
              prices: variantPrices(),
            },
            {
              title: "L",
              sku: "SWEATPANTS-L",
              options: {
                Size: "L",
              },
              prices: variantPrices(),
            },
            {
              title: "XL",
              sku: "SWEATPANTS-XL",
              options: {
                Size: "XL",
              },
              prices: variantPrices(),
            },
          ],
          sales_channels: [
            {
              id: defaultSalesChannel.id,
            },
          ],
        },
        {
          title: "Medusa Shorts",
          category_ids: [
            categoryResult.find((cat) => cat.name === "Merch")!.id,
          ],
          description:
            "Reimagine the feeling of classic shorts. With our cotton shorts, everyday essentials no longer have to be ordinary.",
          handle: "shorts",
          weight: 400,
          status: ProductStatus.PUBLISHED,
          shipping_profile_id: shippingProfile.id,
          images: [
            {
              url:
                "https://medusa-public-images.s3.eu-west-1.amazonaws.com/shorts-vintage-front.png",
            },
            {
              url:
                "https://medusa-public-images.s3.eu-west-1.amazonaws.com/shorts-vintage-back.png",
            },
          ],
          options: [
            {
              title: "Size",
              values: ["S", "M", "L", "XL"],
            },
          ],
          variants: [
            {
              title: "S",
              sku: "SHORTS-S",
              options: {
                Size: "S",
              },
              prices: variantPrices(),
            },
            {
              title: "M",
              sku: "SHORTS-M",
              options: {
                Size: "M",
              },
              prices: variantPrices(),
            },
            {
              title: "L",
              sku: "SHORTS-L",
              options: {
                Size: "L",
              },
              prices: variantPrices(),
            },
            {
              title: "XL",
              sku: "SHORTS-XL",
              options: {
                Size: "XL",
              },
              prices: variantPrices(),
            },
          ],
          sales_channels: [
            {
              id: defaultSalesChannel.id,
            },
          ],
        },
      ],
    },
  });
  logger.info("Finished seeding product data.");

  logger.info("Seeding inventory levels.");

  const { data: inventoryItems } = await query.graph({
    entity: "inventory_item",
    fields: ["id"],
  });

  await createInventoryLevelsWorkflow(container).run({
    input: {
      inventory_levels: inventoryItems.flatMap((item) =>
        stockLocationResult.map((stockLocation) => ({
          location_id: stockLocation.id,
          stocked_quantity: 1000000,
          inventory_item_id: item.id,
        }))
      ),
    },
  });

  logger.info("Finished seeding inventory levels data.");
}
