import { z } from "zod";

const domainRegex = /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;

export const createBlogSchema = z
  .object({
    clientId: z.string().uuid("Invalid client ID"),
    domain: z
      .string()
      .min(1, "Domain is required")
      .regex(domainRegex, "Invalid domain format (e.g. example.com)"),

    platform: z.enum(["wordpress", "shopify"]).default("wordpress"),

    // WordPress fields
    wpUrl: z.string().url("Must be a valid URL").optional().or(z.literal("")),
    wpUsername: z.string().optional().or(z.literal("")),
    wpAppPassword: z.string().optional().or(z.literal("")),
    seoPlugin: z.enum(["yoast", "rankmath", "none"]).optional().default("none"),

    // Shopify fields
    shopifyStoreUrl: z
      .string()
      .optional()
      .or(z.literal(""))
      .refine(
        (v) => !v || /^[a-z0-9-]+\.myshopify\.com$/i.test(v) || /^https?:\/\//.test(v),
        "Use format: mystore.myshopify.com",
      ),
    shopifyAdminApiToken: z.string().optional().or(z.literal("")),
    shopifyApiVersion: z.string().optional().or(z.literal("")),
    shopifyBlogId: z.string().optional().or(z.literal("")),

    // Legacy hosting/registrar/SSL fields (kept optional for backward compat)
    hostingProvider: z.string().optional().or(z.literal("")),
    hostingLoginUrl: z.string().url("Must be a valid URL").optional().or(z.literal("")),
    hostingUsername: z.string().optional().or(z.literal("")),
    hostingPassword: z.string().optional().or(z.literal("")),
    registrar: z.string().optional().or(z.literal("")),
    registrarLoginUrl: z.string().url("Must be a valid URL").optional().or(z.literal("")),
    registrarUsername: z.string().optional().or(z.literal("")),
    registrarPassword: z.string().optional().or(z.literal("")),
    domainExpiryDate: z.string().optional().or(z.literal("")),
    hostingExpiryDate: z.string().optional().or(z.literal("")),
    sslExpiryDate: z.string().optional().or(z.literal("")),

    postingFrequency: z.string().optional().or(z.literal("")),
    postingFrequencyDays: z.coerce
      .number()
      .int()
      .positive()
      .optional()
      .or(z.literal("").transform(() => undefined)),
    status: z
      .enum(["active", "paused", "setup", "decommissioned"])
      .optional()
      .default("setup"),
    notesInternal: z.string().optional().or(z.literal("")),
  })
  .superRefine((data, ctx) => {
    // Platform-specific required fields — only enforced when the blog goes active.
    // "setup" status is allowed to skip credentials so admins can save drafts.
    if (data.status !== "active") return;

    if (data.platform === "wordpress") {
      if (!data.wpUrl) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["wpUrl"],
          message: "WordPress URL is required to activate",
        });
      }
      if (!data.wpAppPassword) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["wpAppPassword"],
          message: "WordPress application password is required to activate",
        });
      }
    } else if (data.platform === "shopify") {
      if (!data.shopifyStoreUrl) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["shopifyStoreUrl"],
          message: "Shopify store URL is required to activate",
        });
      }
      if (!data.shopifyAdminApiToken) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["shopifyAdminApiToken"],
          message: "Shopify Admin API token is required to activate",
        });
      }
    }
  });

export const updateBlogSchema = z
  .object({
    domain: z
      .string()
      .min(1, "Domain is required")
      .regex(domainRegex, "Invalid domain format (e.g. example.com)")
      .optional(),
    platform: z.enum(["wordpress", "shopify"]).optional(),
    wpUrl: z.string().url("Must be a valid URL").optional().or(z.literal("")),
    wpUsername: z.string().optional().or(z.literal("")),
    wpAppPassword: z.string().optional().or(z.literal("")),
    seoPlugin: z.enum(["yoast", "rankmath", "none"]).optional(),
    shopifyStoreUrl: z.string().optional().or(z.literal("")),
    shopifyAdminApiToken: z.string().optional().or(z.literal("")),
    shopifyApiVersion: z.string().optional().or(z.literal("")),
    shopifyBlogId: z.string().optional().or(z.literal("")),
    hostingProvider: z.string().optional().or(z.literal("")),
    hostingLoginUrl: z.string().url().optional().or(z.literal("")),
    hostingUsername: z.string().optional().or(z.literal("")),
    hostingPassword: z.string().optional().or(z.literal("")),
    registrar: z.string().optional().or(z.literal("")),
    registrarLoginUrl: z.string().url().optional().or(z.literal("")),
    registrarUsername: z.string().optional().or(z.literal("")),
    registrarPassword: z.string().optional().or(z.literal("")),
    domainExpiryDate: z.string().optional().or(z.literal("")),
    hostingExpiryDate: z.string().optional().or(z.literal("")),
    sslExpiryDate: z.string().optional().or(z.literal("")),
    postingFrequency: z.string().optional().or(z.literal("")),
    postingFrequencyDays: z.coerce
      .number()
      .int()
      .positive()
      .optional()
      .or(z.literal("").transform(() => undefined)),
    status: z.enum(["active", "paused", "setup", "decommissioned"]).optional(),
    notesInternal: z.string().optional().or(z.literal("")),
  });

export type CreateBlogInput = z.infer<typeof createBlogSchema>;
export type UpdateBlogInput = z.infer<typeof updateBlogSchema>;
