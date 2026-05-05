import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useCart } from "@/hooks/useCart";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/integrations/firebase/config";
import { toast } from "sonner";
import { formatLKR } from "@/lib/format";
import { Banknote, Building2, Truck, Zap, Clock } from "lucide-react";

const SL_DISTRICTS = [
  "Colombo", "Gampaha", "Kalutara", "Kandy", "Matale", "Nuwara Eliya",
  "Galle", "Matara", "Hambantota", "Jaffna", "Kilinochchi", "Mannar",
  "Vavuniya", "Mullaitivu", "Batticaloa", "Ampara", "Trincomalee",
  "Kurunegala", "Puttalam", "Anuradhapura", "Polonnaruwa", "Badulla",
  "Monaragala", "Ratnapura", "Kegalle",
];

type Delivery = "standard" | "express" | "same_day";

const DELIVERY_OPTIONS: { id: Delivery; label: string; desc: string; price: number; icon: any }[] = [
  { id: "standard", label: "Standard Delivery", desc: "2-5 business days", price: 0, icon: Truck },
  { id: "express", label: "Express Delivery", desc: "1-2 business days", price: 350, icon: Zap },
  { id: "same_day", label: "Same-Day (Colombo only)", desc: "Within 6 hours", price: 750, icon: Clock },
];

const Checkout = () => {
  const { items, total, clear } = useCart();
  const { user, roles, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [district, setDistrict] = useState("");
  const [postal, setPostal] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [method, setMethod] = useState<"cod" | "bank_transfer">("cod");
  const [delivery, setDelivery] = useState<Delivery>("standard");
  const [coupon, setCoupon] = useState<{ code: string; discount: number; label: string } | null>(null);

  useEffect(() => {
    const raw = sessionStorage.getItem("cart_coupon");
    if (raw) {
      try { setCoupon(JSON.parse(raw)); } catch {}
    }
  }, []);

  if (authLoading) return <div className="container py-12 text-center">Loading...</div>;
  if (!user) return <Navigate to="/auth?redirect=/checkout" replace />;
  if (roles.includes("admin")) return <Navigate to="/admin" replace />;
  if (items.length === 0) return <Navigate to="/cart" replace />;

  const deliveryFee = DELIVERY_OPTIONS.find((d) => d.id === delivery)?.price ?? 0;
  const discount = coupon?.discount ?? 0;
  const grandTotal = Math.max(0, total + deliveryFee - discount);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (delivery === "same_day" && district.toLowerCase() !== "colombo") {
      toast.error("Same-Day delivery is only available in Colombo district.");
      return;
    }
    setSubmitting(true);
    const fullAddress = `${name}\n${address}\n${city}, ${district}${postal ? " " + postal : ""}`;
    const orderNotes = [
      notes,
      `Delivery: ${DELIVERY_OPTIONS.find((d) => d.id === delivery)?.label}`,
      coupon ? `Coupon: ${coupon.code} (-${formatLKR(coupon.discount)})` : "",
    ].filter(Boolean).join("\n");

    try {
      const orderRef = await addDoc(collection(db, "orders"), {
        customerId: user.id,
        customerEmail: user.email ?? null,
        totalAmount: grandTotal,
        status: "pending",
        paymentMethod: method,
        shippingAddress: fullAddress,
        shippingPhone: phone,
        notes: orderNotes,
        items: items.map((i) => ({
          productId: i.product.id,
          sellerId: i.product.seller_id,
          productName: i.product.name,
          unitPrice: i.product.price,
          quantity: i.quantity,
        })),
        createdAt: serverTimestamp(),
      });

      sessionStorage.removeItem("cart_coupon");
      await clear();
      toast.success(`Order placed! 🎉 Order #${orderRef.id.slice(0, 8).toUpperCase()}`);
      navigate("/orders");
    } catch (err: any) {
      toast.error(err.message ?? "Order failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="container py-8 max-w-5xl">
      <h1 className="font-display text-3xl mb-6">Checkout</h1>
      <form onSubmit={submit} className="grid lg:grid-cols-[1fr_360px] gap-6">
        <div className="space-y-6">
          <Card className="p-6">
            <h3 className="font-display text-xl mb-4">Shipping Details</h3>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <Label>Full Name *</Label>
                <Input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Kasun Perera" />
              </div>
              <div className="sm:col-span-2">
                <Label>Phone Number *</Label>
                <Input required value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+94 77 123 4567" />
              </div>
              <div className="sm:col-span-2">
                <Label>Street Address *</Label>
                <Textarea required value={address} onChange={(e) => setAddress(e.target.value)} placeholder="No. 123, Galle Road" rows={2} />
              </div>
              <div>
                <Label>City *</Label>
                <Input required value={city} onChange={(e) => setCity(e.target.value)} placeholder="Colombo 03" />
              </div>
              <div>
                <Label>District *</Label>
                <Select value={district} onValueChange={setDistrict} required>
                  <SelectTrigger><SelectValue placeholder="Select district" /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    {SL_DISTRICTS.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Postal Code</Label>
                <Input value={postal} onChange={(e) => setPostal(e.target.value)} placeholder="00300" />
              </div>
              <div className="sm:col-span-2">
                <Label>Delivery Notes (optional)</Label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Landmark, gate code..." rows={2} />
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <h3 className="font-display text-xl mb-4">Delivery Method</h3>
            <RadioGroup value={delivery} onValueChange={(v: any) => setDelivery(v)} className="space-y-3">
              {DELIVERY_OPTIONS.map((opt) => (
                <label key={opt.id} className={`flex items-start gap-3 p-4 border rounded-lg cursor-pointer transition-smooth ${delivery === opt.id ? "border-primary bg-primary/5" : "border-border"}`}>
                  <RadioGroupItem value={opt.id} />
                  <opt.icon className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                  <div className="flex-1">
                    <div className="font-semibold flex items-center justify-between gap-2">
                      <span>{opt.label}</span>
                      <span className="text-primary font-display">{opt.price === 0 ? "FREE" : formatLKR(opt.price)}</span>
                    </div>
                    <div className="text-sm text-muted-foreground">{opt.desc}</div>
                  </div>
                </label>
              ))}
            </RadioGroup>
          </Card>

          <Card className="p-6">
            <h3 className="font-display text-xl mb-4">Payment Method</h3>
            <RadioGroup value={method} onValueChange={(v: any) => setMethod(v)} className="space-y-3">
              <label className={`flex items-start gap-3 p-4 border rounded-lg cursor-pointer transition-smooth ${method === "cod" ? "border-primary bg-primary/5" : "border-border"}`}>
                <RadioGroupItem value="cod" />
                <Banknote className="h-5 w-5 text-primary mt-0.5" />
                <div>
                  <div className="font-semibold">Cash on Delivery</div>
                  <div className="text-sm text-muted-foreground">Pay in cash when your order arrives.</div>
                </div>
              </label>
              <label className={`flex items-start gap-3 p-4 border rounded-lg cursor-pointer transition-smooth ${method === "bank_transfer" ? "border-primary bg-primary/5" : "border-border"}`}>
                <RadioGroupItem value="bank_transfer" />
                <Building2 className="h-5 w-5 text-primary mt-0.5" />
                <div>
                  <div className="font-semibold">Bank Transfer</div>
                  <div className="text-sm text-muted-foreground">We'll send bank details after order confirmation.</div>
                </div>
              </label>
            </RadioGroup>
            <p className="text-xs text-muted-foreground mt-4 italic">💳 Card payments coming soon</p>
          </Card>
        </div>

        <Card className="p-6 h-fit lg:sticky lg:top-20 shadow-card">
          <h3 className="font-display text-xl mb-4">Order Summary</h3>
          <div className="space-y-2 max-h-60 overflow-y-auto pr-2 mb-3">
            {items.map((i) => (
              <div key={i.id} className="flex justify-between text-sm gap-2">
                <span className="line-clamp-1">{i.product.name} × {i.quantity}</span>
                <span className="font-medium shrink-0">{formatLKR(i.product.price * i.quantity)}</span>
              </div>
            ))}
          </div>
          <div className="border-t pt-3 space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{formatLKR(total)}</span></div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Shipping</span>
              <span className={deliveryFee === 0 ? "text-success" : ""}>{deliveryFee === 0 ? "FREE" : formatLKR(deliveryFee)}</span>
            </div>
            {coupon && (
              <div className="flex justify-between text-success">
                <span>Discount ({coupon.code})</span><span>−{formatLKR(coupon.discount)}</span>
              </div>
            )}
          </div>
          <div className="flex justify-between font-display text-lg font-bold mt-3 pt-3 border-t">
            <span>Total</span><span className="text-primary">{formatLKR(grandTotal)}</span>
          </div>
          <Button type="submit" variant="hero" className="w-full mt-4" size="lg" disabled={submitting}>
            {submitting ? "Placing order..." : "Place Order"}
          </Button>
          <p className="text-[11px] text-muted-foreground text-center mt-3">
            🔒 Secure checkout • SSL encrypted
          </p>
        </Card>
      </form>
    </div>
  );
};

export default Checkout;
