"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { createBlogSchema, type CreateBlogInput } from "@/lib/validators/blog";
import { createBlog, updateBlog } from "@/lib/actions/blog-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

// ─── Types ──────────────────────────────────────────────────────────────────

interface ClientOption {
  id: string;
  name: string;
}

interface BlogFormProps {
  mode: "create" | "edit";
  blogId?: string;
  clients: ClientOption[];
  defaultValues?: Partial<CreateBlogInput>;
  defaultClientId?: string;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function BlogForm({
  mode,
  blogId,
  clients,
  defaultValues,
  defaultClientId,
}: BlogFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const form = useForm({
    resolver: zodResolver(createBlogSchema),
    defaultValues: {
      clientId: defaultClientId || defaultValues?.clientId || "",
      domain: defaultValues?.domain || "",
      platform: defaultValues?.platform || "wordpress",
      wpUrl: defaultValues?.wpUrl || "",
      wpUsername: defaultValues?.wpUsername || "",
      wpAppPassword: defaultValues?.wpAppPassword || "",
      seoPlugin: defaultValues?.seoPlugin || "none",
      shopifyStoreUrl: defaultValues?.shopifyStoreUrl || "",
      shopifyAdminApiToken: defaultValues?.shopifyAdminApiToken || "",
      shopifyApiVersion: defaultValues?.shopifyApiVersion || "2024-07",
      shopifyBlogId: defaultValues?.shopifyBlogId || "",
      postingFrequency: defaultValues?.postingFrequency || "",
      postingFrequencyDays: defaultValues?.postingFrequencyDays ?? undefined,
      status: defaultValues?.status || "setup",
      notesInternal: defaultValues?.notesInternal || "",
    },
  });

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = form;

  const platform = watch("platform");

  const onSubmit = (data: CreateBlogInput) => {
    startTransition(async () => {
      let result;
      if (mode === "create") {
        result = await createBlog(data);
      } else {
        result = await updateBlog(blogId!, data);
      }

      if ("error" in result) {
        toast.error(result.error);
        return;
      }

      toast.success(mode === "create" ? "Blog created" : "Blog updated");
      if (mode === "create" && "id" in result) {
        router.push(`/blogs/${result.id}`);
      } else {
        router.push(`/blogs/${blogId}`);
      }
      router.refresh();
    });
  };

  const Field = ({
    label,
    name,
    type = "text",
    placeholder,
  }: {
    label: string;
    name: keyof CreateBlogInput;
    type?: string;
    placeholder?: string;
  }) => (
    <div className="space-y-1.5">
      <Label htmlFor={name}>{label}</Label>
      <Input
        id={name}
        type={type}
        placeholder={placeholder}
        {...register(name)}
      />
      {errors[name] && (
        <p className="text-xs text-destructive">
          {errors[name]?.message as string}
        </p>
      )}
    </div>
  );

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* Identity Section */}
      <Card>
        <CardHeader>
          <CardTitle>Identity</CardTitle>
          <CardDescription>Basic blog identification</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="clientId">Client</Label>
            <Select
              value={watch("clientId")}
              onValueChange={(v) => setValue("clientId", v, { shouldValidate: true })}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a client" />
              </SelectTrigger>
              <SelectContent>
                {clients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.clientId && (
              <p className="text-xs text-destructive">{errors.clientId.message}</p>
            )}
          </div>

          <Field label="Domain" name="domain" placeholder="example.com" />

          <div className="space-y-1.5">
            <Label htmlFor="status">Status</Label>
            <Select
              value={watch("status")}
              onValueChange={(v) =>
                setValue("status", v as CreateBlogInput["status"], { shouldValidate: true })
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="paused">Paused</SelectItem>
                <SelectItem value="setup">Setup</SelectItem>
                <SelectItem value="decommissioned">Decommissioned</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Platform Selector */}
      <Card>
        <CardHeader>
          <CardTitle>Platform</CardTitle>
          <CardDescription>
            Choose the CMS this blog publishes to
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() =>
                setValue("platform", "wordpress", { shouldValidate: true })
              }
              className={`flex flex-col items-start gap-1 rounded-lg border-2 p-4 text-left transition-colors ${
                platform === "wordpress"
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/50"
              }`}
            >
              <span className="font-medium">WordPress</span>
              <span className="text-xs text-muted-foreground">
                Self-hosted or WP.com via REST API + Application Password
              </span>
            </button>
            <button
              type="button"
              onClick={() =>
                setValue("platform", "shopify", { shouldValidate: true })
              }
              className={`flex flex-col items-start gap-1 rounded-lg border-2 p-4 text-left transition-colors ${
                platform === "shopify"
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/50"
              }`}
            >
              <span className="font-medium">Shopify</span>
              <span className="text-xs text-muted-foreground">
                Shopify store blog via Admin API access token
              </span>
            </button>
          </div>
        </CardContent>
      </Card>

      {/* WordPress Credentials */}
      {platform === "wordpress" && (
        <Card>
          <CardHeader>
            <CardTitle>WordPress Credentials</CardTitle>
            <CardDescription>
              REST API authentication. Generate an Application Password under
              Users → Profile → Application Passwords.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field
              label="WordPress URL"
              name="wpUrl"
              placeholder="https://example.com"
            />
            <Field label="WP Username" name="wpUsername" placeholder="admin" />
            <Field
              label="WP Application Password"
              name="wpAppPassword"
              type="password"
              placeholder="xxxx xxxx xxxx xxxx"
            />
            <div className="space-y-1.5">
              <Label htmlFor="seoPlugin">SEO Plugin</Label>
              <Select
                value={watch("seoPlugin")}
                onValueChange={(v) =>
                  setValue("seoPlugin", v as CreateBlogInput["seoPlugin"], {
                    shouldValidate: true,
                  })
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select SEO plugin" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="yoast">Yoast SEO</SelectItem>
                  <SelectItem value="rankmath">Rank Math</SelectItem>
                  <SelectItem value="none">None</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Shopify Credentials */}
      {platform === "shopify" && (
        <Card>
          <CardHeader>
            <CardTitle>Shopify Credentials</CardTitle>
            <CardDescription>
              Create a custom app in your Shopify admin and grant it
              read/write_content scopes. Paste the Admin API access token
              below.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Store URL"
              name="shopifyStoreUrl"
              placeholder="mystore.myshopify.com"
            />
            <Field
              label="Admin API Access Token"
              name="shopifyAdminApiToken"
              type="password"
              placeholder="shpat_xxxxxxxxxxxxxxxx"
            />
            <Field
              label="API Version"
              name="shopifyApiVersion"
              placeholder="2024-07"
            />
            <Field
              label="Blog ID (optional)"
              name="shopifyBlogId"
              placeholder="Leave blank to use first blog"
            />
          </CardContent>
        </Card>
      )}

      {/* Posting Config */}
      <Card>
        <CardHeader>
          <CardTitle>Posting Configuration</CardTitle>
          <CardDescription>Expected posting schedule</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Posting Frequency"
            name="postingFrequency"
            placeholder="3x per week"
          />
          <div className="space-y-1.5">
            <Label htmlFor="postingFrequencyDays">Frequency (days)</Label>
            <Input
              id="postingFrequencyDays"
              type="number"
              min={1}
              placeholder="e.g. 3"
              {...register("postingFrequencyDays")}
            />
            {errors.postingFrequencyDays && (
              <p className="text-xs text-destructive">
                {errors.postingFrequencyDays.message as string}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Notes */}
      <Card>
        <CardHeader>
          <CardTitle>Internal Notes</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            placeholder="Internal notes about this blog..."
            rows={4}
            {...register("notesInternal")}
          />
        </CardContent>
      </Card>

      <Separator />

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={isPending}>
          {isPending && <Loader2 className="size-4 animate-spin" data-icon="inline-start" />}
          {mode === "create" ? "Create Blog" : "Save Changes"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
          disabled={isPending}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
