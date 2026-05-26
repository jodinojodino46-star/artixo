import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useCart } from "@/hooks/useCart";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { formatLKR } from "@/lib/format";
import { Banknote, CreditCard, Truck, Shield } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

// PayHere global — loaded via <script src="https://www.payhere.lk/lib/payhere.js"> in index.html
declare const payhere: {
  startPayment: (payment: object) => void;
  onCompleted: ((orderId: string) => void) | null;
  onDismissed: (() => void) | null;
  onError: ((error: string) => void) | null;
};

// --- Sri Lanka Districts ---
const SL_DISTRICTS = [
  "Colombo", "Gampaha", "Kalutara", "Kandy", "Matale", "Nuwara Eliya",
  "Galle", "Matara", "Hambantota", "Jaffna", "Kilinochchi", "Mannar",
  "Vavuniya", "Mullaitivu", "Batticaloa", "Ampara", "Trincomalee",
  "Kurunegala", "Puttalam", "Anuradhapura", "Polonnaruwa", "Badulla",
  "Moneragala", "Ratnapura", "Kegalle",
];

// --- Main Checkout Component ---
const Checkout = () => {
  const { items: cartItems, clear } = useCart();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [paymentMethod, setPaymentMethod] = useState<"payhere" | "cod">("payhere");
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: user?.email || "",
    address: "",
    city: "",
    district: "",
    postalCode: "",
    notes: "",
  });

  useEffect(() => {
    if (user?.email) setForm((f) => ({ ...f, email: user.email || "" }));
  }, [user]);

  if (!user) return <Navigate to="/auth" replace />;
  if (cartItems.length === 0) return <Navigate to="/cart" replace />;

  const subtotal = cartItems.reduce((s, i) => s + (i.product?.price || 0) * i.quantity, 0);
  const shipping = subtotal >= 5000 ? 0 : 350;
  const total = subtotal + shipping;

  const handleInputChange = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const validateForm = () => {
    if (!form.name.trim()) { toast.error("Please enter your full name"); return false; }
    if (!form.phone.trim()) { toast.error("Please enter your phone number"); return false; }
    if (!form.address.trim()) { toast.error("Please enter your address"); return false; }
    if (!form.district) { toast.error("Please select your district"); return false; }
    if (!form.city.trim()) { toast.error("Please enter your city/town"); return false; }
    return true;
  };

  const saveOrder = async (paymentRef?: string) => {
    const shippingAddressText = [
      form.name,
      form.address,
      [form.city, form.district, form.postalCode].filter(Boolean).join(", "),
      form.email ? `Email: ${form.email}` : "",
    ].filter(Boolean).join("\n");

    const orderPayload = {
      customer_id: user.id,
      total_amount: total,
      payment_method: (paymentMethod === "cod" ? "cod" : "bank_transfer") as "cod" | "bank_transfer",
      shipping_address: shippingAddressText,
      shipping_phone: form.phone,
      notes: [form.notes, paymentRef ? `Payment: ${paymentRef}` : ""].filter(Boolean).join(" | ") || null,
      status: (paymentRef ? "confirmed" : "pending") as "pending" | "confirmed",
    };

    const { data: order, error } = await supabase
      .from("orders")
      .insert(orderPayload)
      .select()
      .maybeSingle();

    if (error) {
      console.error("Order save error:", JSON.stringify(error));
      throw new Error(error.message || "Database error when saving order.");
    }

    if (!order) {
      console.error("Order insert returned no data — possible RLS issue");
      throw new Error("Order could not be saved. Please try again.");
    }

    const itemRows = cartItems.map((i) => ({
      order_id: order.id,
      product_id: i.product_id,
      product_name: i.product?.name || "Unknown Product",
      unit_price: i.product?.price || 0,
      quantity: i.quantity,
      seller_id: i.product?.seller_id || user.id,
    }));

    const { error: itemsError } = await supabase.from("order_items").insert(itemRows);
    if (itemsError) {
      console.error("Order items save error:", JSON.stringify(itemsError));
    }

    supabase.functions
      .invoke("send-order-confirmation", { body: { order_id: order.id, is_update: false } })
      .catch((emailErr) => console.error("Confirmation email error:", emailErr));

    return order;
  };

  const handleCOD = async () => {
    if (!validateForm()) return;
    setLoading(true);
    try {
      await saveOrder();
      try { await (clear as any)(); } catch (_) {}
      toast.success("🎉 Order placed! Cash on delivery confirmed.");
      navigate("/orders");
    } catch (err: any) {
      console.error("handleCOD error:", err);
      toast.error(err?.message || "Failed to place order. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handlePayHere = async () => {
    if (!validateForm()) return;
    setLoading(true);
    try {
      const order = await saveOrder();

      payhere.onCompleted = async (payhereOrderId: string) => {
        try {
          await supabase
            .from("orders")
            .update({ status: "confirmed", notes: `PayHere ID: ${payhereOrderId}` })
            .eq("id", order.id);
          try { await (clear as any)(); } catch (_) {}
          toast.success("🎉 Payment successful! Your order is confirmed.");
          navigate("/orders");
        } catch {
          toast.success("🎉 Payment received! Check your orders page.");
          navigate("/orders");
        }
      };

      payhere.onDismissed = () => {
        toast.warning("Payment cancelled. Your order is saved — you can pay later from your orders page.");
        setLoading(false);
      };

      payhere.onError = (error: string) => {
        console.error("PayHere error:", error);
        toast.error("Payment failed. Please try again.");
        setLoading(false);
      };

      const nameParts = form.name.trim().split(" ");
      const firstName = nameParts[0] || "Customer";
      const lastName = nameParts.slice(1).join(" ") || ".";

      const payment = {
        sandbox: import.meta.env.VITE_PAYHERE_SANDBOX === "true",
        merchant_id: import.meta.env.VITE_PAYHERE_MERCHANT_ID || "",
        return_url: `${window.location.origin}/orders`,
        cancel_url: `${window.location.origin}/checkout`,
        notify_url: import.meta.env.VITE_PAYHERE_NOTIFY_URL || "",
        order_id: order.id,
        items: cartItems.map((i) => i.product?.name || "Item").slice(0, 5).join(", "),
        amount: total.toFixed(2),
        currency: "LKR",
        first_name: firstName,
        last_name: lastName,
        email: form.email || user.email || "",
        phone: form.phone.replace(/\s/g, ""),
        address: form.address,
        city: form.city,
        country: "Sri Lanka",
        delivery_address: form.address,
        delivery_city: form.city,
        delivery_country: "Sri Lanka",
      };

      payhere.startPayment(payment);
    } catch (err: any) {
      console.error("handlePayHere error:", err);
      toast.error(err?.message || "Failed to initialize payment. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Checkout</h1>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Truck className="h-5 w-5 text-blue-600" />
                  Shipping Details
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label>Full Name *</Label>
                    <Input placeholder="e.g. Kamal Perera" value={form.name} onChange={(e) => handleInputChange("name", e.target.value)} />
                  </div>
                  <div>
                    <Label>Phone Number *</Label>
                    <Input placeholder="e.g. 077 123 4567" value={form.phone} onChange={(e) => handleInputChange("phone", e.target.value)} />
                  </div>
                </div>
                <div>
                  <Label>Email</Label>
                  <Input type="email" placeholder="your@email.com" value={form.email} onChange={(e) => handleInputChange("email", e.target.value)} />
                </div>
                <div>
                  <Label>Street Address *</Label>
                  <Input placeholder="House no, Street, Area" value={form.address} onChange={(e) => handleInputChange("address", e.target.value)} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <Label>District *</Label>
                    <Select value={form.district} onValueChange={(v) => handleInputChange("district", v)}>
                      <SelectTrigger><SelectValue placeholder="Select district" /></SelectTrigger>
                      <SelectContent>
                        {SL_DISTRICTS.map((d) => (<SelectItem key={d} value={d}>{d}</SelectItem>))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>City / Town *</Label>
                    <Input placeholder="e.g. Nugegoda" value={form.city} onChange={(e) => handleInputChange("city", e.target.value)} />
                  </div>
                  <div>
                    <Label>Postal Code</Label>
                    <Input placeholder="e.g. 10250" value={form.postalCode} onChange={(e) => handleInputChange("postalCode", e.target.value)} />
                  </div>
                </div>
                <div>
                  <Label>Order Notes (optional)</Label>
                  <Textarea placeholder="Any special instructions for delivery..." value={form.notes} onChange={(e) => handleInputChange("notes", e.target.value)} rows={2} />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Shield className="h-5 w-5 text-green-600" />
                  Payment Method
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <RadioGroup value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as "payhere" | "cod")}>
                  <div className={`flex items-center gap-3 border rounded-lg p-4 cursor-pointer transition-colors ${paymentMethod === "payhere" ? "border-blue-500 bg-blue-50" : "border-gray-200 hover:border-gray-300"}`} onClick={() => setPaymentMethod("payhere")}>
                    <RadioGroupItem value="payhere" id="payhere" />
                    <CreditCard className="h-5 w-5 text-blue-600" />
                    <div className="flex-1">
                      <Label htmlFor="payhere" className="cursor-pointer font-semibold">Online Payment — PayHere</Label>
                      <p className="text-sm text-gray-500">Visa, Mastercard, Amex, Internet Banking — Secured by PayHere</p>
                    </div>
                    <img src="https://www.payhere.lk/downloads/images/payhere_short_logo.png" alt="PayHere" className="h-8 object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                  </div>
                  <div className={`flex items-center gap-3 border rounded-lg p-4 cursor-pointer transition-colors ${paymentMethod === "cod" ? "border-orange-500 bg-orange-50" : "border-gray-200 hover:border-gray-300"}`} onClick={() => setPaymentMethod("cod")}>
                    <RadioGroupItem value="cod" id="cod" />
                    <Banknote className="h-5 w-5 text-orange-600" />
                    <div>
                      <Label htmlFor="cod" className="cursor-pointer font-semibold">Cash on Delivery</Label>
                      <p className="text-sm text-gray-500">Pay when your order arrives</p>
                    </div>
                  </div>
                </RadioGroup>
                {paymentMethod === "payhere" && (
                  <Button type="button" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 text-base mt-2" onClick={handlePayHere} disabled={loading}>
                    {loading ? (<span className="flex items-center gap-2"><svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" /></svg>Processing...</span>) : (<span className="flex items-center gap-2"><CreditCard className="h-5 w-5" />Pay {formatLKR(total)} with PayHere</span>)}
                  </Button>
                )}
                {paymentMethod === "cod" && (
                  <Button className="w-full bg-orange-500 hover:bg-orange-600 text-white font-semibold py-3 text-base mt-2" onClick={handleCOD} disabled={loading}>
                    {loading ? (<span className="flex items-center gap-2"><svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" /></svg>Placing Order...</span>) : (<span className="flex items-center gap-2"><Banknote className="h-5 w-5" />Place Order — Pay on Delivery</span>)}
                  </Button>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-1">
            <Card className="sticky top-6">
              <CardHeader><CardTitle className="text-lg">Order Summary</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3 max-h-64 overflow-y-auto">
                  {cartItems.map((item) => (
                    <div key={item.id} className="flex gap-3 items-center">
                      <img src={item.product?.image_url || "/placeholder.png"} alt={item.product?.name || ""} className="w-14 h-14 object-cover rounded-md border" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">{item.product?.name}</p>
                        <p className="text-xs text-gray-500">Qty: {item.quantity}</p>
                      </div>
                      <p className="text-sm font-semibold text-gray-800 whitespace-nowrap">{formatLKR((item.product?.price || 0) * item.quantity)}</p>
                    </div>
                  ))}
                </div>
                <div className="border-t pt-4 space-y-2">
                  <div className="flex justify-between text-sm text-gray-600">
                    <span>Subtotal ({cartItems.reduce((s, i) => s + i.quantity, 0)} items)</span>
                    <span>{formatLKR(subtotal)}</span>
                  </div>
                  <div className="flex justify-between text-sm text-gray-600">
                    <span className="flex items-center gap-1"><Truck className="h-3 w-3" /> Shipping</span>
                    <span className={shipping === 0 ? "text-green-600 font-medium" : ""}>{shipping === 0 ? "FREE" : formatLKR(shipping)}</span>
                  </div>
                  {shipping === 0 && (<p className="text-xs text-green-600">✓ Free shipping on orders over Rs. 5,000</p>)}
                  <div className="border-t pt-2 flex justify-between text-base font-bold text-gray-900">
                    <span>Total</span>
                    <span>{formatLKR(total)}</span>
                  </div>
                </div>
                <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-500 space-y-1">
                  <p className="flex items-center gap-1"><Shield className="h-3 w-3 text-green-600" /> Secure checkout</p>
                  <p className="flex items-center gap-1"><Truck className="h-3 w-3 text-blue-600" /> Island-wide delivery</p>
                  <p className="flex items-center gap-1"><Banknote className="h-3 w-3 text-orange-600" /> Cash on delivery available</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Checkout;
