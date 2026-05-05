import { useEffect, useState } from "react";
import { Navigate, Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { collection, getDocs, query, where, orderBy } from "firebase/firestore";
import { db } from "@/integrations/firebase/config";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { formatLKR } from "@/lib/format";
import { Package, ChevronDown, ChevronUp, MapPin, Phone } from "lucide-react";
import { OrderStatusTimeline, OrderStatus } from "@/components/OrderStatusTimeline";

const statusColors: Record<string, string> = {
  pending: "bg-muted text-muted-foreground",
  confirmed: "bg-accent text-accent-foreground",
  shipped: "bg-primary text-primary-foreground",
  delivered: "bg-success text-success-foreground",
  cancelled: "bg-destructive text-destructive-foreground",
};

const Orders = () => {
  const { user, roles, loading: authLoading } = useAuth();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const snap = await getDocs(
        query(
          collection(db, "orders"),
          where("customerId", "==", user.id),
          orderBy("createdAt", "desc")
        )
      );
      setOrders(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    })();
  }, [user]);

  if (!authLoading && !user) return <Navigate to="/auth" replace />;
  if (user && roles.includes("admin")) return <Navigate to="/admin" replace />;
  if (loading) return <div className="container py-12 text-center">Loading...</div>;

  return (
    <div className="container py-8 max-w-4xl">
      <h1 className="font-display text-3xl mb-6">My Orders</h1>
      {orders.length === 0 ? (
        <Card className="p-12 text-center">
          <Package className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
          <p className="text-muted-foreground mb-4">No orders yet.</p>
          <Link to="/products" className="text-primary hover:underline">Start shopping →</Link>
        </Card>
      ) : (
        <div className="space-y-4">
          {orders.map((o) => {
            const isOpen = expanded === o.id;
            const createdAt = o.createdAt?.toDate?.() ?? new Date();
            const orderItems: any[] = o.items ?? [];
            return (
              <Card key={o.id} className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                  <div>
                    <div className="text-xs text-muted-foreground">Order #{o.id.slice(0, 8)}</div>
                    <div className="text-sm">{createdAt.toLocaleString("en-LK")}</div>
                  </div>
                  <Badge className={statusColors[o.status]}>{o.status.toUpperCase()}</Badge>
                </div>

                <OrderStatusTimeline status={o.status as OrderStatus} />

                <Separator className="my-3" />

                <div className="space-y-1 mb-3 text-sm">
                  {orderItems.map((it: any, idx: number) => (
                    <div key={idx} className="flex justify-between">
                      <span>{it.productName} × {it.quantity}</span>
                      <span>{formatLKR(it.unitPrice * it.quantity)}</span>
                    </div>
                  ))}
                </div>

                <div className="flex justify-between items-center pt-3 border-t text-sm">
                  <span className="text-muted-foreground">
                    {o.paymentMethod === "cod" ? "💵 Cash on Delivery" : "🏦 Bank Transfer"}
                  </span>
                  <span className="font-display font-bold text-primary text-lg">{formatLKR(o.totalAmount)}</span>
                </div>

                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-2 w-full"
                  onClick={() => setExpanded(isOpen ? null : o.id)}
                >
                  {isOpen ? <><ChevronUp className="h-4 w-4 mr-1" /> Hide details</> : <><ChevronDown className="h-4 w-4 mr-1" /> Shipping details</>}
                </Button>

                {isOpen && (
                  <div className="mt-3 pt-3 border-t space-y-2 text-sm">
                    <div className="flex items-start gap-2">
                      <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                      <span>{o.shippingAddress}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span>{o.shippingPhone}</span>
                    </div>
                    {o.notes && <p className="text-muted-foreground italic">"{o.notes}"</p>}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default Orders;
