import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { doc, updateDoc, arrayUnion } from "firebase/firestore";
import { db } from "@/integrations/firebase/config";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Store, Check } from "lucide-react";

const BecomeSeller = () => {
  const { user, roles, loading: authLoading, refreshRoles } = useAuth();
  const navigate = useNavigate();
  const [shopName, setShopName] = useState("");
  const [shopDesc, setShopDesc] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);

  if (authLoading) return <div className="container py-12 text-center">Loading...</div>;
  if (!user) return <Navigate to="/auth?redirect=/become-seller" replace />;
  if (roles.includes("admin")) return <Navigate to="/admin" replace />;
  if (roles.includes("seller")) return <Navigate to="/seller" replace />;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await updateDoc(doc(db, "users", user.id), {
        shopName,
        shopDescription: shopDesc,
        phone,
        roles: arrayUnion("seller"),
      });
      await refreshRoles();
      toast.success("🎉 Welcome, seller! Start uploading products.");
      navigate("/seller");
    } catch (err: any) {
      toast.error(err.message ?? "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container py-8 max-w-3xl">
      <Card className="p-8 shadow-card">
        <div className="flex items-center gap-3 mb-6">
          <div className="h-12 w-12 rounded-xl gradient-saffron flex items-center justify-center text-primary-foreground shadow-glow">
            <Store className="h-6 w-6" />
          </div>
          <div>
            <h1 className="font-display text-2xl">Become a Seller</h1>
            <p className="text-sm text-muted-foreground">Open your shop in minutes</p>
          </div>
        </div>

        <div className="grid sm:grid-cols-3 gap-3 mb-6">
          {["Free to start", "Island-wide reach", "Admin support"].map((b) => (
            <div key={b} className="flex items-center gap-2 text-sm bg-success/10 text-success rounded-lg p-3">
              <Check className="h-4 w-4" /> {b}
            </div>
          ))}
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label>Shop Name *</Label>
            <Input required value={shopName} onChange={(e) => setShopName(e.target.value)} placeholder="e.g. Colombo Crafts" />
          </div>
          <div>
            <Label>Shop Description</Label>
            <Textarea value={shopDesc} onChange={(e) => setShopDesc(e.target.value)} placeholder="Tell customers what you sell..." rows={3} />
          </div>
          <div>
            <Label>Contact Phone *</Label>
            <Input required value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+94 77 123 4567" />
          </div>
          <Button type="submit" variant="hero" size="lg" className="w-full" disabled={loading}>
            {loading ? "Opening shop..." : "Open My Shop"}
          </Button>
          <p className="text-xs text-muted-foreground text-center">By continuing, products you upload require admin approval before going live.</p>
        </form>
      </Card>
    </div>
  );
};

export default BecomeSeller;
