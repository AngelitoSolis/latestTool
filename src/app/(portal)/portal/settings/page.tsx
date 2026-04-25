import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/helpers";
import { db } from "@/lib/db";
import { clients } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

export default async function PortalSettingsPage() {
  const session = await getSession();
  if (!session || !session.user.clientId) redirect("/login");

  const [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.id, session.user.clientId))
    .limit(1);

  if (!client) redirect("/login");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Account Settings</h1>
        <p className="text-muted-foreground">
          Your account and billing overview
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Your Profile</CardTitle>
          <CardDescription>
            Signed-in session details. Contact your account manager to update
            these.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Field label="Name" value={session.user.name} />
          <Field label="Email" value={session.user.email} />
          <Field label="Role" value="Client" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Company</CardTitle>
          <CardDescription>
            How we have you on file
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <Field label="Company name" value={client.name} />
          <Field label="Niche" value={client.niche || "—"} />
          <Field label="Contact name" value={client.contactName || "—"} />
          <Field label="Contact email" value={client.contactEmail || "—"} />
          <Field label="Contact phone" value={client.contactPhone || "—"} />
          <Field
            label="Blog network target"
            value={`${client.totalBlogsTarget ?? 0} blogs`}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Billing</CardTitle>
          <CardDescription>
            Your current plan. Invoices are available in the Invoices tab.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <Field
            label="Plan"
            value={
              client.billingType
                ? client.billingType.replace("_", " ")
                : "—"
            }
            capitalize
          />
          <Field
            label="Amount"
            value={
              client.billingAmount
                ? `$${Number(client.billingAmount).toLocaleString()}`
                : "—"
            }
          />
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Status</Label>
            <div>
              <Badge
                variant={
                  client.billingStatus === "active"
                    ? "default"
                    : client.billingStatus === "overdue"
                      ? "destructive"
                      : "secondary"
                }
                className="capitalize"
              >
                {client.billingStatus}
              </Badge>
            </div>
          </div>
          <Field
            label="Next billing date"
            value={
              client.nextBillingDate
                ? new Date(client.nextBillingDate).toLocaleDateString()
                : "—"
            }
          />
          {client.setupFee && Number(client.setupFee) > 0 && (
            <>
              <Separator className="sm:col-span-2" />
              <Field
                label="Setup fee"
                value={`$${Number(client.setupFee).toLocaleString()}`}
              />
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">
                  Setup fee status
                </Label>
                <div>
                  <Badge variant={client.setupFeePaid ? "default" : "outline"}>
                    {client.setupFeePaid ? "Paid" : "Unpaid"}
                  </Badge>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Field({
  label,
  value,
  capitalize,
}: {
  label: string;
  value: string;
  capitalize?: boolean;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <p className={`text-sm ${capitalize ? "capitalize" : ""}`}>{value}</p>
    </div>
  );
}
