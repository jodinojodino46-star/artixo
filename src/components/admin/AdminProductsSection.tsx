import { useEffect, useState } from "react";
import {
  collection, getDocs, addDoc, updateDoc, deleteDoc, doc,
  query, orderBy, serverTimestamp,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "@/integrations/firebase/config";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import {
  Plus, Edit, Trash2, Upload, Search, Package, FileSpreadsheet, Download,
} from "lucide-react";
import { formatLKR } from "@/lib/format";

interface Category { id: string; name: string }
interface ProductRow {
  id: string; name: string; price: number; stock: number; status: string;
  imageUrl: string | null; description: string | null; categoryId: string | null;
  originalPrice: number | null; brand: string | null; sku: string | null;
  isTrending: boolean;
}

const emptyForm = {
  name: "", description: "", price: "", original_price: "", stock: "",
  category_id: "", image_url: "", brand: "", sku: "", is_trending: false,
};

export const AdminProductsSection = ({ adminUserId }: { adminUserId: string }) => {
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ProductRow | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkResult, setBulkResult] = useState<{ ok: number; fail: number; errors: string[] } | null>(null);

  const refresh = async () => {
    const snap = await getDocs(query(collection(db, "products"), orderBy("createdAt", "desc")));
    setProducts(snap.docs.map((d) => ({ id: d.id, ...d.data() })) as ProductRow[]);
  };

  useEffect(() => {
    getDocs(collection(db, "categories")).then((snap) =>
      setCategories(snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Category[])
    );
    refresh();
  }, []);

  const openNew = () => { setEditing(null); setForm(emptyForm); setOpen(true); };

  const openEdit = (p: ProductRow) => {
    setEditing(p);
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
      is_trending: p.isTrending,
    });
    setOpen(true);
  };

  const uploadFile = async (file: File): Promise<string | null> => {
    const ext = file.name.split(".").pop();
    const path = `product-images/${adminUserId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    try {
      const storageRef = ref(storage, path);
      await uploadBytes(storageRef, file);
      return await getDownloadURL(storageRef);
    } catch (err: any) {
      toast.error(err.message ?? "Upload failed");
      return null;
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const url = await uploadFile(file);
    if (url) { setForm((f) => ({ ...f, image_url: url })); toast.success("Image uploaded"); }
    setUploading(false);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const priceNum = parseFloat(form.price);
    const origNum = form.original_price ? parseFloat(form.original_price) : null;
    if (origNum && origNum <= priceNum) { toast.error("Original price must be higher than selling price"); return; }
    setSaving(true);
    const payload = {
      sellerId: adminUserId,
      name: form.name,
      description: form.description || null,
      price: priceNum,
      originalPrice: origNum,
      stock: parseInt(form.stock),
      categoryId: form.category_id || null,
      imageUrl: form.image_url || null,
      brand: form.brand || null,
      sku: form.sku || null,
      isTrending: form.is_trending,
      status: "approved",
    };
    try {
      if (editing) {
        await updateDoc(doc(db, "products", editing.id), payload);
        toast.success("Product updated — live now");
      } else {
        await addDoc(collection(db, "products"), { ...payload, images: [], specifications: {}, variants: [], createdAt: serverTimestamp() });
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
    toast.success("Deleted");
    refresh();
  };

  // Bulk CSV upload
  const csvTemplate =
    "name,description,price,original_price,stock,brand,sku,category,image_url,is_trending\n" +
    "Sample Tea,Premium Ceylon black tea 250g,1200,1500,50,Dilmah,DLM-001,,https://example.com/tea.jpg,true\n" +
    "Sample Spice,Organic cinnamon sticks 100g,800,,30,,,,,false\n";

  const downloadTemplate = () => {
    const blob = new Blob([csvTemplate], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "products-template.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const parseCsv = (text: string): Record<string, string>[] => {
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) return [];
    const parseLine = (line: string): string[] => {
      const out: string[] = []; let cur = "", inQ = false;
      for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === '"') { if (inQ && line[i + 1] === '"') { cur += '"'; i++; } else inQ = !inQ; }
        else if (c === "," && !inQ) { out.push(cur); cur = ""; }
        else cur += c;
      }
      out.push(cur); return out;
    };
    const headers = parseLine(lines[0]).map((h) => h.trim().toLowerCase());
    return lines.slice(1).map((line) => {
      const cells = parseLine(line);
      const row: Record<string, string> = {};
      headers.forEach((h, i) => { row[h] = (cells[i] ?? "").trim(); });
      return row;
    });
  };

  const handleBulkUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBulkBusy(true); setBulkResult(null);
    try {
      const text = await file.text();
      const rows = parseCsv(text);
      if (rows.length === 0) { toast.error("CSV is empty or invalid"); setBulkBusy(false); return; }
      const catMap = new Map(categories.map((c) => [c.name.toLowerCase(), c.id]));
      const errors: string[] = [];
      let ok = 0, fail = 0;
      for (let idx = 0; idx < rows.length; idx++) {
        const r = rows[idx];
        const lineNo = idx + 2;
        if (!r.name) { errors.push(`Line ${lineNo}: missing name`); fail++; continue; }
        const price = parseFloat(r.price);
        if (isNaN(price) || price < 0) { errors.push(`Line ${lineNo}: invalid price`); fail++; continue; }
        const stock = parseInt(r.stock || "0");
        const orig = r.original_price ? parseFloat(r.original_price) : null;
        const catId = r.category ? catMap.get(r.category.toLowerCase()) ?? null : null;
        try {
          await addDoc(collection(db, "products"), {
            sellerId: adminUserId,
            name: r.name,
            description: r.description || null,
            price,
            originalPrice: orig && orig > price ? orig : null,
            stock: isNaN(stock) ? 0 : stock,
            brand: r.brand || null,
            sku: r.sku || null,
            categoryId: catId,
            imageUrl: r.image_url || null,
            isTrending: ["true", "1", "yes"].includes((r.is_trending || "").toLowerCase()),
            status: "approved",
            images: [], specifications: {}, variants: [],
            createdAt: serverTimestamp(),
          });
          ok++;
        } catch { fail++; errors.push(`Line ${lineNo}: insert failed`); }
      }
      setBulkResult({ ok, fail, errors: errors.slice(0, 10) });
      if (ok > 0) toast.success(`${ok} product(s) uploaded & live`);
      if (fail > 0) toast.error(`${fail} row(s) failed`);
      refresh();
    } catch (err: any) {
      toast.error(err.message ?? "Upload failed");
    } finally {
      setBulkBusy(false); e.target.value = "";
    }
  };

  const filtered = products.filter((p) =>
    p.name?.toLowerCase().includes(search.toLowerCase()) ||
    p.brand?.toLowerCase().includes(search.toLowerCase()) ||
    p.sku?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="hero" onClick={openNew}><Plus className="h-4 w-4 mr-1" /> Add Product</Button>
        <Button variant="outline" onClick={() => { setBulkOpen(true); setBulkResult(null); }}>
          <FileSpreadsheet className="h-4 w-4 mr-1" /> Bulk Upload
        </Button>
        <Button variant="ghost" onClick={downloadTemplate}><Download className="h-4 w-4 mr-1" /> CSV Template</Button>
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="p-4 border-b flex items-center gap-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search by name, brand, SKU…" value={search} onChange={(e) => setSearch(e.target.value)} className="border-0 focus-visible:ring-0 px-0" />
          <span className="text-xs text-muted-foreground">{filtered.length} item(s)</span>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Stock</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded bg-muted overflow-hidden shrink-0">
                        {p.imageUrl ? <img src={p.imageUrl} alt={p.name} className="h-full w-full object-cover" /> : <div className="h-full w-full flex items-center justify-center"><Package className="h-4 w-4 text-muted-foreground" /></div>}
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium line-clamp-1">{p.name}</div>
                        <div className="text-xs text-muted-foreground">{p.brand ?? "—"} {p.sku ? `• ${p.sku}` : ""}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>{formatLKR(p.price)}</TableCell>
                  <TableCell><span className={p.stock === 0 ? "text-destructive font-medium" : ""}>{p.stock}</span></TableCell>
                  <TableCell>
                    <Badge variant={p.status === "approved" ? "default" : p.status === "rejected" ? "destructive" : "secondary"}>{p.status}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="icon" variant="ghost" onClick={() => openEdit(p)}><Edit className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" onClick={() => del(p.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center py-10 text-muted-foreground">No products</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? "Edit Product" : "Add New Product"}</DialogTitle></DialogHeader>
          <form onSubmit={save} className="space-y-4">
            <div><Label>Product Name *</Label><Input required maxLength={150} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Brand</Label><Input maxLength={60} value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} /></div>
              <div><Label>SKU</Label><Input maxLength={60} value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} /></div>
            </div>
            <div><Label>Description</Label><Textarea rows={3} maxLength={2000} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            <div className="grid grid-cols-3 gap-3">
              <div><Label>Selling Price *</Label><Input required type="number" min="0" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></div>
              <div><Label>Original Price</Label><Input type="number" min="0" step="0.01" value={form.original_price} onChange={(e) => setForm({ ...form, original_price: e.target.value })} /></div>
              <div><Label>Stock *</Label><Input required type="number" min="0" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} /></div>
            </div>
            <div>
              <Label>Category</Label>
              <Select value={form.category_id} onValueChange={(v) => setForm({ ...form, category_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>{categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Main Image</Label>
              <div className="flex items-center gap-3">
                {form.image_url && <img src={form.image_url} alt="" className="h-16 w-16 rounded object-cover border" />}
                <label className="cursor-pointer">
                  <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                  <Button type="button" variant="outline" size="sm" asChild disabled={uploading}>
                    <span><Upload className="h-4 w-4 mr-1" />{uploading ? "Uploading…" : "Upload"}</span>
                  </Button>
                </label>
                <Input placeholder="or paste URL" value={form.image_url} onChange={(e) => setForm({ ...form, image_url: e.target.value })} />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={form.is_trending} onChange={(e) => setForm({ ...form, is_trending: e.target.checked })} />
              Mark as trending
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" variant="hero" disabled={saving}>{saving ? "Saving…" : editing ? "Update" : "Add Product"}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Bulk Upload Products</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="text-sm text-muted-foreground">
              Upload a CSV with columns: <code className="text-xs bg-muted px-1 rounded">name, description, price, original_price, stock, brand, sku, category, image_url, is_trending</code>. Category must match an existing category name.
            </div>
            <Button variant="outline" size="sm" onClick={downloadTemplate}><Download className="h-4 w-4 mr-1" /> Download Template</Button>
            <label className="block">
              <input type="file" accept=".csv,text/csv" className="hidden" onChange={handleBulkUpload} disabled={bulkBusy} />
              <div className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:bg-muted/40 transition-colors">
                <FileSpreadsheet className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                <div className="text-sm font-medium">{bulkBusy ? "Uploading…" : "Click to select CSV file"}</div>
                <div className="text-xs text-muted-foreground mt-1">Up to a few hundred rows</div>
              </div>
            </label>
            {bulkResult && (
              <Card className="p-3 text-sm space-y-2">
                <div className="flex gap-4">
                  <span className="text-success font-medium">✓ {bulkResult.ok} added</span>
                  {bulkResult.fail > 0 && <span className="text-destructive font-medium">✗ {bulkResult.fail} failed</span>}
                </div>
                {bulkResult.errors.length > 0 && (
                  <ul className="text-xs text-muted-foreground list-disc pl-5 space-y-0.5">
                    {bulkResult.errors.map((e, i) => <li key={i}>{e}</li>)}
                  </ul>
                )}
              </Card>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
