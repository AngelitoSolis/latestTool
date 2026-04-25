"use client";

import { useState } from "react";
import { Loader2, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Props {
  blogId: string;
  initialShop?: string | null;
}

export function ShopifyInstallButton({ blogId, initialShop }: Props) {
  const [shop, setShop] = useState(() => {
    if (!initialShop) return "";
    return initialShop.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleInstall() {
    setError(null);
    const trimmed = shop.trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(trimmed)) {
      setError("Enter your Shopify store domain, e.g. my-store.myshopify.com");
      return;
    }
    setPending(true);
    const params = new URLSearchParams({ shop: trimmed, blogId });
    window.location.href = `/api/shopify/oauth/install?${params.toString()}`;
  }

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div className="flex items-center gap-2">
        <ShoppingBag className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-medium">Connect Shopify store via OAuth</h3>
      </div>
      <p className="text-xs text-muted-foreground">
        You&apos;ll be redirected to Shopify to approve the app. On success we&apos;ll save the
        Admin API token against this blog.
      </p>
      <div className="space-y-2">
        <Label htmlFor="shopify-shop-domain">Shop domain</Label>
        <Input
          id="shopify-shop-domain"
          placeholder="my-store.myshopify.com"
          value={shop}
          onChange={(e) => setShop(e.target.value)}
          disabled={pending}
        />
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <Button onClick={handleInstall} disabled={pending || !shop} size="sm">
        {pending ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Redirecting...
          </>
        ) : (
          "Install on Shopify"
        )}
      </Button>
    </div>
  );
}
