import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import {
  collection, getDocs, addDoc, updateDoc, deleteDoc, doc,
  query, where, orderBy, serverTimestamp,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "@/integrations/firebase/config";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Plus, Package, Trash2, Edit, Upload, ShoppingBag, MapPin, Phone } from "lucide-react";
import { formatLKR } from "@/lib/format";
import { OrderStatusTimeline, OrderStatus } from "@/components/OrderStatusTimeline";
import { SellerOrdersWidget, FilterKey, filterOrders } from "@/components/SellerOrdersWidget";

interface Category { id: string; name: string; }
interface Product {
  id: string; name: string; price: number; stock: number; status: string;
  imageUrl: string | null; description: string | null; categoryId: string | null;
  originalPrice?: number | null; brand?: string | null; sku?: string | null;
  images?: string[]; specifications?: Record<string, string>; variants?: any[];
}

interface VariantRow { name: string; values: string; }
interface SpecRow { key: string; value: string; }

const emptyForm = {
  name: "", description: "", price: "", original_price: "", stock: "",
  category_id: "", image_url: "", brand: "", sku: "",
  images: [] as string[],
  specs: [{ key: "", value: "" }] as SpecRow[],
  variants: [{ name: "", values: "" }] as VariantRow[],
};

const SellerDashboard = () => {
  const { user, roles, loading: authLoading } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [orderFilter, setOrderFilter] = useState<FilterKey>("all");

  const refresh = async () => {
    if (!user) return;
    const snap = await getDocs(
      query(collection(db, "products"), where("sellerId", "==", user.id), orderBy("createdAt", "desc"))
    );
    setProducts(snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Product[]);
  };

  const refreshOrders = async () => {
    if (!user) return;
    // Get all orders that have at least one item from this seller
    const snap = await getDocs(
      query(collection(db, "orders"), orderBy("createdAt", "desc"))
    );
    const all = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as any[];
    const mine = all
      .map((o) => {
        const myItems = (o.items ?? []).filter((it: any) => it.sellerId === user.id);
        return myItems.length > 0 ? { ...o, my_items: myItems } : null;
      })
      .filter(Boolean);
    setOrders(mine);
  };

  const updateOrderStatus = async (orderId: string, status: OrderStatus) => {
    await updateDoc(doc(db, "orders", orderId), { status });
    toast.success(`Order marked as ${status}`);
    refreshOrders();
  };

  useEffect(() => {
    getDocs(collection(db, "categories")).then((snap) =>
      setCategories(snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Category[])
    );
    refresh();
    refreshOrders();
  }, [user]);

  if (!authLoading && !user) return <Navigate to="/auth" replace />;
  if (!authLoading && user && roles.includes("admin")) return <Navigate to="/admin" replace />;
  if (!authLoading && user && !roles.includes("seller")) return <Navigate to="/become-seller" replace />;

  const openNew = () => {
    setEditing(null);
    setForm(emptyForm);
    setOpen(true);
  };

  const openEdit = (p: Product) => {
    setEditing(p);
    const specEntries = Object.entries(p.specifications ?? {});
    setForm({
      name: p.name,
      description: p.description ?? "",
      price: String(p.price),
      original_price: p.originalPrice ? String(p.originalPrice) : "",
      stock: String(p.stock),
      category_id: p.categoryId ?? "",
      image_url: p.imageUrl ?? "",
      brand: p.brand ?? "",
      sku: p.sku ?? "",
      images: p.images ?? [],
      specs: specEntries.length ? specEntries.map(([key, value]) => ({ key, value: String(value) })) : [{ key: "", value: "" }],
      variants: (p.variants && p.variants.length)
        ? p.variants.map((v: any) => ({ name: v.name ?? "", values: (v.values ?? []).join(", ") }))
        : [{ name: "", values: "" }],
    });
    setOpen(true);
  };

  const uploadFile = async (file: File): Promise<string | null> => {
    if (!user) return null;
    const ext = file.name.split(".").pop();
    const path = `product-images/${user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    try {
      const storageRef = ref(storage, path);
      await uploadBytes(storageRef, file);
      return await getDownloadURL(storageRef);
    } catch (err: any) {
      toast.error(err.message ?? "Upload failed");
      return null;
    }
  };

  const handleMainUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const url = await uploadFile(file);
    if (url) { setForm((f) => ({ ...f, image_url: url })); toast.success("Main image uploaded"); }
    setUploading(false);
  };

  const handleGalleryUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    setUploading(true);
    const urls: string[] = [];
    for (const f of files) {
      const u = await uploadFile(f);
      if (u) urls.push(u);
    }
    setForm((f) => ({ ...f, images: [...f.images, ...urls].slice(0, 8) }));
    setUploading(false);
    if (urls.length) toast.success(`${urls.length} image(s) added`);
  };

  const removeGalleryImage = (idx: number) =>
    setForm((f) => ({ ...f, images: f.images.filter((_, i) => i !== idx) }));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const priceNum = parseFloat(form.price);
    const origNum = form.original_price ? parseFloat(form.original_price) : null;
    if (origNum && origNum <= priceNum) { toast.error("Original price must be higher than selling price"); return; }
    setSaving(true);
    const specifications = form.specs.reduce<Record<string, string>>((acc, s) => {
      if (s.key.trim()) acc[s.key.trim()] = s.value.trim();
      return acc;
    }, {});
    const variants = form.variants
      .filter((v) => v.name.trim() && v.values.trim())
      .map((v) => ({ name: v.name.trim(), values: v.values.split(",").map((x) => x.trim()).filter(Boolean) }));

    const payload = {
      sellerId: user.id,
      name: form.name,
      description: form.description || null,
      price: priceNum,
      originalPrice: origNum,
      stock: parseInt(form.stock),
      categoryId: form.category_id || null,
      imageUrl: form.image_url || null,
      brand: form.brand || null,
      sku: form.sku || null,
      images: form.images,
      specifications,
      variants,
      status: "approved",
    };

    try {
      if (editing) {
        await updateDoc(doc(db, "products", editing.id), payload);
        toast.success("Product updated — live now");
      } else {
        await addDoc(collection(db, "products"), { ...payload, isTrending: false, createdAt: serverTimestamp() });
        toast.success("Product added — live on website");
      }
      setOpen(false);
      refresh();
    } catch (err: any) {
      toast.error(err.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const del = async (id: string) => {
    if (!confirm("Delete this product?")) return;
    await deleteDoc(doc(db, "products", id));
    refresh();
    toast.success("Deleted");
  };

  return (
    <div className="container py-8">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="font-display text-3xl">Seller Dashboard</h1>
          <p className="text-muted-foreground">Manage your products</p>
        </div>
        <Button variant="hero" onClick={openNew}><Plus className="h-4 w-4 mr-1" /> Add Product</Button>
      </div>

      <div className="grid sm:grid-cols-3 gap-4 mb-6">
        <Card className="p-4"><div className="text-xs text-muted-foreground">Total Products</div><div className="font-display text-2xl">{products.length}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Live</div><div className="font-display text-2xl text-success">{products.filter((p) => p.status === "approved").length}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Pending Approval</div><div className="font-display text-2xl text-primary">{products.filter((p) => p.status === "pending").length}</div></Card>
      </div>

      <Tabs defaultValue="products">
        <TabsList className="mb-4">
          <TabsTrigger value="products"><Package className="h-4 w-4 mr-1" /> Products</TabsTrigger>
          <TabsTrigger value="orders"><ShoppingBag className="h-4 w-4 mr-1" /> Orders ({orders.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="products">
          {products.length === 0 ? (
            <Card className="p-12 text-center border-dashed">
              <Package className="h-16 w-16 mx-auto mb-3 text-muted-foreground" />
              <p className="text-muted-foreground mb-4">No products yet. Add your first one!</p>
              <Button variant="hero" onClick={openNew}><Plus className="h-4 w-4 mr-1" /> Add Product</Button>
            </Card>
          ) : (
            <div className="grid gap-3">
              {products.map((p) => (
                <Card key={p.id} className="p-4 flex gap-4 items-center">
                  <div className="h-16 w-16 rounded-lg bg-muted overflow-hidden shrink-0">
                    {p.imageUrl ? <img src={p.imageUrl} alt={p.name} className="h-full w-full object-cover" /> : <div className="h-full w-full flex items-center justify-center"><Package className="h-6 w-6 text-muted-foreground" /></div>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium line-clamp-1">{p.name}</div>
                    <div className="text-sm text-muted-foreground">{formatLKR(p.price)} • Stock: {p.stock}</div>
                  </div>
                  <Badge className={p.status === "approved" ? "bg-success text-success-foreground" : p.status === "pending" ? "bg-primary/20 text-primary" : "bg-destructive text-destructive-foreground"}>
                    {p.status}
                  </Badge>
                  <Button variant="ghost" size="icon" onClick={() => openEdit(p)}><Edit className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => del(p.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="orders">
          <SellerOrdersWidget orders={orders} filter={orderFilter} onFilterChange={setOrderFilter} />
          {(() => {
            const visible = filterOrders(orders, orderFilter);
            if (orders.length === 0) {
              return (
                <Card className="p-12 text-center border-dashed">
                  <ShoppingBag className="h-16 w-16 mx-auto mb-3 text-muted-foreground" />
                  <p className="text-muted-foreground">No orders yet for your products.</p>
                </Card>
              );
            }
            if (visible.length === 0) {
              return (
                <Card className="p-12 text-center border-dashed">
                  <ShoppingBag className="h-16 w-16 mx-auto mb-3 text-muted-foreground" />
                  <p className="text-muted-foreground">No orders match this filter.</p>
                </Card>
              );
            }
            return (
              <div className="space-y-4">
                {visible.map((o: any) => {
                  const myTotal = o.my_items.reduce((s: number, it: any) => s + Number(it.unitPrice) * it.quantity, 0);
                  const createdAt = o.createdAt?.toDate?.() ?? new Date();
                  return (
                    <Card key={o.id} className="p-5">
                      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                        <div>
                          <div className="text-xs text-muted-foreground">Order #{o.id.slice(0, 8)}</div>
                          <div className="text-sm">{createdAt.toLocaleString("en-LK")}</div>
                        </div>
                        <Badge>{o.status.toUpperCase()}</Badge>
                      </div>

                      <OrderStatusTimeline status={o.status as OrderStatus} />

                      <Separator className="my-3" />

                      <div className="space-y-1 mb-3 text-sm">
                        {o.my_items.map((it: any, idx: number) => (
                          <div key={idx} className="flex justify-between">
                            <span>{it.productName} × {it.quantity}</span>
                            <span>{formatLKR(it.unitPrice * it.quantity)}</span>
                          </div>
                        ))}
                      </div>

                      <div className="space-y-1.5 text-sm pt-2 border-t">
                        <div className="flex items-start gap-2"><MapPin className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" /><span>{o.shippingAddress}</span></div>
                        <div className="flex items-center gap-2"><Phone className="h-4 w-4 text-muted-foreground shrink-0" /><span>{o.shippingPhone}</span></div>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-3 pt-3 mt-3 border-t">
                        <span className="font-display font-bold text-primary">Your portion: {formatLKR(myTotal)}</span>
                        {o.status !== "delivered" && o.status !== "cancelled" && (
                          <div className="flex items-center gap-2">
                            <Label className="text-xs">Update status:</Label>
                            <Select value={o.status} onValueChange={(v) => updateOrderStatus(o.id, v as OrderStatus)}>
                              <SelectTrigger className="w-40 h-9"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="pending">Pending</SelectItem>
                                <SelectItem value="confirmed">Confirmed</SelectItem>
                                <SelectItem value="shipped">Shipped</SelectItem>
                                <SelectItem value="delivered">Delivered</SelectItem>
                                <SelectItem value="cancelled">Cancelled</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                      </div>
                    </Card>
                  );
                })}
              </div>
            );
          })()}
        </TabsContent>
      </Tabs>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? "Edit Product" : "Add New Product"}</DialogTitle></DialogHeader>
          <form onSubmit={save} className="space-y-4">
            <div className="space-y-3">
              <div><Label>Product Name *</Label><Input required maxLength={150} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Brand</Label><Input maxLength={60} value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} /></div>
                <div><Label>SKU / Product Code</Label><Input maxLength={60} value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} /></div>
              </div>
              <div><Label>Description</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} maxLength={2000} /></div>
            </div>

            <Separator />

            <div className="space-y-2">
              <div className="font-medium text-sm">Pricing</div>
              <div className="grid grid-cols-3 gap-3">
                <div><Label>Selling Price *</Label><Input required type="number" min="0" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></div>
                <div><Label>Original Price</Label><Input type="number" min="0" step="0.01" placeholder="For discount" value={form.original_price} onChange={(e) => setForm({ ...form, original_price: e.target.value })} /></div>
                <div><Label>Stock *</Label><Input required type="number" min="0" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} /></div>
              </div>
            </div>

            <div>
              <Label>Category</Label>
              <Select value={form.category_id} onValueChange={(v) => setForm({ ...form, category_id: v })}>
                <SelectTrigger><SelectValue placeholder="Choose category" /></SelectTrigger>
                <SelectContent>{categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>

            <Separator />

            <div>
              <Label>Main Image *</Label>
              {form.image_url && <img src={form.image_url} alt="" className="h-24 w-24 rounded-lg object-cover mb-2 border" />}
              <label className="flex items-center justify-center gap-2 border border-dashed rounded-lg p-3 cursor-pointer hover:bg-muted transition-smooth mb-2">
                <Upload className="h-4 w-4" />
                <span className="text-sm">{uploading ? "Uploading..." : "Click to upload main image"}</span>
                <input type="file" accept="image/*" className="hidden" onChange={handleMainUpload} disabled={uploading} />
              </label>
              <Input
                placeholder="Or paste image URL (e.g. https://i.imgur.com/abc.jpg)"
                value={form.image_url}
                onChange={(e) => setForm({ ...form, image_url: e.target.value })}
              />
            </div>

            <div>
              <Label>Additional Images (gallery)</Label>
              {form.images.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-2">
                  {form.images.map((url, i) => (
                    <div key={i} className="relative h-20 w-20 rounded-lg overflow-hidden border group">
                      <img src={url} alt="" className="h-full w-full object-cover" />
                      <button type="button" onClick={() => removeGalleryImage(i)} className="absolute top-0.5 right-0.5 bg-destructive text-destructive-foreground rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-smooth">
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <label className="flex items-center justify-center gap-2 border border-dashed rounded-lg p-3 cursor-pointer hover:bg-muted transition-smooth mb-2">
                <Upload className="h-4 w-4" />
                <span className="text-sm">{uploading ? "Uploading..." : "Add gallery images (multiple, up to 8)"}</span>
                <input type="file" accept="image/*" multiple className="hidden" onChange={handleGalleryUpload} disabled={uploading || form.images.length >= 8} />
              </label>
              <Input
                placeholder="Or paste gallery image URL and press Enter"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    const url = (e.target as HTMLInputElement).value.trim();
                    if (url && form.images.length < 8) {
                      setForm((f) => ({ ...f, images: [...f.images, url] }));
                      (e.target as HTMLInputElement).value = "";
                    }
                  }
                }}
              />
            </div>

            <Separator />

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Specifications</Label>
                <Button type="button" variant="outline" size="sm" onClick={() => setForm({ ...form, specs: [...form.specs, { key: "", value: "" }] })}><Plus className="h-3 w-3 mr-1" /> Add row</Button>
              </div>
              <div className="space-y-2">
                {form.specs.map((s, i) => (
                  <div key={i} className="flex gap-2">
                    <Input placeholder="e.g. Material" value={s.key} maxLength={50} onChange={(e) => { const next = [...form.specs]; next[i] = { ...next[i], key: e.target.value }; setForm({ ...form, specs: next }); }} />
                    <Input placeholder="e.g. Cotton 100%" value={s.value} maxLength={200} onChange={(e) => { const next = [...form.specs]; next[i] = { ...next[i], value: e.target.value }; setForm({ ...form, specs: next }); }} />
                    <Button type="button" variant="ghost" size="icon" onClick={() => setForm({ ...form, specs: form.specs.filter((_, x) => x !== i) })}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Variants (size, color, etc.)</Label>
                <Button type="button" variant="outline" size="sm" onClick={() => setForm({ ...form, variants: [...form.variants, { name: "", values: "" }] })}><Plus className="h-3 w-3 mr-1" /> Add variant</Button>
              </div>
              <div className="space-y-2">
                {form.variants.map((v, i) => (
                  <div key={i} className="flex gap-2">
                    <Input placeholder="e.g. Size" value={v.name} maxLength={40} className="w-32" onChange={(e) => { const next = [...form.variants]; next[i] = { ...next[i], name: e.target.value }; setForm({ ...form, variants: next }); }} />
                    <Input placeholder="comma separated values e.g. S,M,L,XL" value={v.values} maxLength={200} onChange={(e) => { const next = [...form.variants]; next[i] = { ...next[i], values: e.target.value }; setForm({ ...form, variants: next }); }} />
                    <Button type="button" variant="ghost" size="icon" onClick={() => setForm({ ...form, variants: form.variants.filter((_, x) => x !== i) })}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" variant="hero" disabled={uploading}>{editing ? "Update Product" : "Add Product"}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SellerDashboard;
