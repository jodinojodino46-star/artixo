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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Trash2, Pencil, Image as ImageIcon, Upload } from "lucide-react";

interface Banner {
  id: string;
  title: string | null;
  subtitle: string | null;
  imageUrl: string;
  linkUrl: string | null;
  ctaText: string | null;
  displayOrder: number;
  isActive: boolean;
}

const empty = {
  title: "",
  subtitle: "",
  imageUrl: "",
  linkUrl: "/products",
  ctaText: "Shop Now",
  displayOrder: 0,
  isActive: true,
};

export const AdminBannersSection = () => {
  const [banners, setBanners] = useState<Banner[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Banner | null>(null);
  const [form, setForm] = useState({ ...empty });
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const snap = await getDocs(query(collection(db, "banners"), orderBy("displayOrder")));
    setBanners(snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Banner[]);
  };

  useEffect(() => { load(); }, []);

  const openNew = () => {
    setEditing(null);
    setForm({ ...empty, displayOrder: banners.length });
    setOpen(true);
  };

  const openEdit = (b: Banner) => {
    setEditing(b);
    setForm({
      title: b.title ?? "",
      subtitle: b.subtitle ?? "",
      imageUrl: b.imageUrl,
      linkUrl: b.linkUrl ?? "",
      ctaText: b.ctaText ?? "",
      displayOrder: b.displayOrder,
      isActive: b.isActive,
    });
    setOpen(true);
  };

  const onUpload = async (file: File) => {
    setUploading(true);
    const ext = file.name.split(".").pop();
    const path = `banners/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    try {
      const storageRef = ref(storage, path);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      setForm((f) => ({ ...f, imageUrl: url }));
      toast.success("Image uploaded");
    } catch (err: any) {
      toast.error(err.message ?? "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    if (!form.imageUrl) { toast.error("Please upload a banner image"); return; }
    setSaving(true);
    const payload = {
      title: form.title || null,
      subtitle: form.subtitle || null,
      imageUrl: form.imageUrl,
      linkUrl: form.linkUrl || null,
      ctaText: form.ctaText || null,
      displayOrder: Number(form.displayOrder) || 0,
      isActive: form.isActive,
    };
    try {
      if (editing) {
        await updateDoc(doc(db, "banners", editing.id), payload);
        toast.success("Banner updated");
      } else {
        await addDoc(collection(db, "banners"), { ...payload, createdAt: serverTimestamp() });
        toast.success("Banner added");
      }
      setOpen(false);
      load();
    } catch (err: any) {
      toast.error(err.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this banner?")) return;
    await deleteDoc(doc(db, "banners", id));
    toast.success("Banner deleted");
    load();
  };

  const toggleActive = async (b: Banner) => {
    await updateDoc(doc(db, "banners", b.id), { isActive: !b.isActive });
    load();
  };

  return (
    <Card className="p-0 overflow-hidden">
      <div className="p-4 flex items-center justify-between border-b">
        <div>
          <h3 className="font-semibold">Hero Banners</h3>
          <p className="text-xs text-muted-foreground">
            Manage homepage hero banners. Active banners auto-rotate every 6s.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={openNew}><Plus className="h-4 w-4 mr-1" /> New Banner</Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader><DialogTitle>{editing ? "Edit Banner" : "New Banner"}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Banner Image *</Label>
                <div className="mt-1 flex items-center gap-3">
                  <div className="h-24 w-40 rounded bg-muted overflow-hidden flex items-center justify-center shrink-0">
                    {form.imageUrl ? (
                      <img src={form.imageUrl} alt="preview" className="h-full w-full object-cover" />
                    ) : (
                      <ImageIcon className="h-6 w-6 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex-1 space-y-2">
                    <label>
                      <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(f); }} />
                      <div className="border border-dashed rounded p-3 text-sm text-center cursor-pointer hover:bg-muted/50">
                        <Upload className="h-4 w-4 inline mr-1" />
                        {uploading ? "Uploading..." : "Click to upload image"}
                      </div>
                    </label>
                    <Input
                      placeholder="Or paste image URL"
                      value={form.imageUrl}
                      onChange={(e) => setForm((f) => ({ ...f, imageUrl: e.target.value }))}
                    />
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Title</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Big Sale!" /></div>
                <div><Label>CTA Text</Label><Input value={form.ctaText} onChange={(e) => setForm({ ...form, ctaText: e.target.value })} placeholder="Shop Now" /></div>
              </div>
              <div><Label>Subtitle</Label><Textarea rows={2} value={form.subtitle} onChange={(e) => setForm({ ...form, subtitle: e.target.value })} placeholder="Up to 50% off..." /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Link URL</Label><Input value={form.linkUrl} onChange={(e) => setForm({ ...form, linkUrl: e.target.value })} placeholder="/products" /></div>
                <div><Label>Display Order</Label><Input type="number" value={form.displayOrder} onChange={(e) => setForm({ ...form, displayOrder: Number(e.target.value) })} /></div>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={form.isActive} onCheckedChange={(v) => setForm({ ...form, isActive: v })} />
                <Label>Active (visible on homepage)</Label>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button onClick={save} disabled={saving || uploading}>{saving ? "Saving..." : "Save Banner"}</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {banners.length === 0 ? (
        <div className="p-12 text-center text-muted-foreground">
          <ImageIcon className="h-10 w-10 mx-auto mb-2" />
          No banners yet. Add one to customize the homepage hero.
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Preview</TableHead>
              <TableHead>Title</TableHead>
              <TableHead>Order</TableHead>
              <TableHead>Active</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {banners.map((b) => (
              <TableRow key={b.id}>
                <TableCell>
                  <div className="h-12 w-20 rounded bg-muted overflow-hidden">
                    <img src={b.imageUrl} alt={b.title ?? ""} className="h-full w-full object-cover" />
                  </div>
                </TableCell>
                <TableCell>
                  <div className="font-medium">{b.title ?? "—"}</div>
                  <div className="text-xs text-muted-foreground line-clamp-1 max-w-[280px]">{b.subtitle}</div>
                </TableCell>
                <TableCell>{b.displayOrder}</TableCell>
                <TableCell><Switch checked={b.isActive} onCheckedChange={() => toggleActive(b)} /></TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="outline" onClick={() => openEdit(b)}><Pencil className="h-4 w-4" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => remove(b.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Card>
  );
};
