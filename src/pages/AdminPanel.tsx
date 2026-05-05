import { useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import {
  collection, getDocs, query, orderBy, where, updateDoc, doc, limit,
} from "firebase/firestore";
import { db } from "@/integrations/firebase/config";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider,
  SidebarTrigger, SidebarFooter,
} from "@/components/ui/sidebar";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import {
  Package, Check, X, Shield, LayoutDashboard, ShoppingBag, Users, ClipboardList,
  TrendingUp, DollarSign, Search, LogOut, Store, Image as ImageIcon,
} from "lucide-react";
import { formatLKR } from "@/lib/format";
import { AdminProductsSection } from "@/components/admin/AdminProductsSection";
import { AdminBannersSection } from "@/components/admin/AdminBannersSection";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { FileDown } from "lucide-react";

const generateReceiptPDF = (order: any) => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  doc.setFillColor(255, 209, 0);
  doc.rect(0, 0, pageWidth, 28, "F");
  doc.setTextColor(141, 21, 58);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("ARTIXO", 14, 18);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text("Order Receipt", pageWidth - 14, 18, { align: "right" });
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text(`Order #${order.id.slice(0, 8).toUpperCase()}`, 14, 40);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const createdAt = order.createdAt?.toDate?.() ?? new Date();
  doc.text(`Date: ${createdAt.toLocaleString("en-LK")}`, 14, 46);
  doc.text(`Status: ${String(order.status).toUpperCase()}`, 14, 51);
  doc.text(`Payment: ${String(order.paymentMethod).toUpperCase()}`, 14, 56);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Customer Details", 14, 68);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  let y = 74;
  doc.text(`Name: ${order.customerName ?? "—"}`, 14, y); y += 5;
  doc.text(`Email: ${order.customerEmail ?? "—"}`, 14, y); y += 5;
  doc.text(`Phone: ${order.shippingPhone ?? "—"}`, 14, y); y += 5;
  const addrLines = doc.splitTextToSize(`Address: ${order.shippingAddress ?? "—"}`, pageWidth - 28);
  doc.text(addrLines, 14, y);
  y += addrLines.length * 5 + 4;
  if (order.notes) {
    const noteLines = doc.splitTextToSize(`Notes: ${order.notes}`, pageWidth - 28);
    doc.text(noteLines, 14, y);
    y += noteLines.length * 5 + 4;
  }
  const items = order.items ?? [];
  autoTable(doc, {
    startY: y + 2,
    head: [["#", "Product", "Qty", "Unit Price", "Subtotal"]],
    body: items.map((it: any, i: number) => [i + 1, it.productName, it.quantity, formatLKR(it.unitPrice), formatLKR(Number(it.unitPrice) * Number(it.quantity))]),
    headStyles: { fillColor: [141, 21, 58], textColor: 255 },
    styles: { fontSize: 9 },
  });
  const finalY = (doc as any).lastAutoTable.finalY ?? y + 30;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(`Total: ${formatLKR(order.totalAmount)}`, pageWidth - 14, finalY + 10, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(120);
  doc.text("Thank you for shopping with ARTIXO!", pageWidth / 2, 285, { align: "center" });
  doc.save(`receipt-${order.id.slice(0, 8)}.pdf`);
};

type Section = "dashboard" | "pending" | "products" | "orders" | "sellers" | "banners";

const navItems: { key: Section; label: string; icon: any }[] = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "pending", label: "Pending Approval", icon: ClipboardList },
  { key: "products", label: "All Products", icon: ShoppingBag },
  { key: "orders", label: "Orders", icon: Package },
  { key: "banners", label: "Banners", icon: ImageIcon },
  { key: "sellers", label: "Sellers", icon: Users },
];

const AdminPanel = () => {
  const { user, roles, loading: authLoading, signOut } = useAuth();
  const [section, setSection] = useState<Section>("dashboard");
  const [pending, setPending] = useState<any[]>([]);
  const [allProducts, setAllProducts] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [sellers, setSellers] = useState<any[]>([]);
  const [search, setSearch] = useState("");

  const refresh = async () => {
    const [pSnap, aSnap, oSnap, uSnap] = await Promise.all([
      getDocs(query(collection(db, "products"), where("status", "==", "pending"), orderBy("createdAt"))),
      getDocs(query(collection(db, "products"), orderBy("createdAt", "desc"), limit(100))),
      getDocs(query(collection(db, "orders"), orderBy("createdAt", "desc"), limit(50))),
      getDocs(collection(db, "users")),
    ]);

    const usersMap: Record<string, any> = {};
    uSnap.docs.forEach((d) => { usersMap[d.id] = d.data(); });

    const pendingList = pSnap.docs.map((d) => {
      const data = d.data();
      return { id: d.id, ...data, sellerProfile: usersMap[data.sellerId] ?? null };
    });

    const productList = aSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

    const orderList = oSnap.docs.map((d) => {
      const data = d.data();
      const customer = usersMap[data.customerId] ?? null;
      return { id: d.id, ...data, customerName: customer?.fullName ?? null, customerEmail: customer?.email ?? null };
    });

    const sellerList = Object.entries(usersMap)
      .filter(([, u]) => (u.roles ?? []).includes("seller"))
      .map(([id, u]) => ({ id, ...u }));

    setPending(pendingList);
    setAllProducts(productList);
    setOrders(orderList);
    setSellers(sellerList);
  };

  const updateOrderStatus = async (id: string, status: string) => {
    await updateDoc(doc(db, "orders", id), { status });
    toast.success(`Order ${status}`);
    refresh();
  };

  useEffect(() => {
    if (roles.includes("admin")) refresh();
  }, [roles]);

  const stats = useMemo(() => {
    const totalRevenue = orders.reduce((sum, o) => sum + Number(o.totalAmount || 0), 0);
    const pendingOrders = orders.filter((o) => o.status === "pending").length;
    return {
      revenue: totalRevenue,
      orders: orders.length,
      products: allProducts.length,
      pendingProducts: pending.length,
      pendingOrders,
      sellers: sellers.length,
    };
  }, [orders, allProducts, pending, sellers]);

  if (!authLoading && (!user || !roles.includes("admin"))) {
    return (
      <div className="container py-12 max-w-md">
        <Card className="p-8 text-center">
          <Shield className="h-12 w-12 mx-auto mb-3 text-muted-foreground" />
          <h2 className="font-display text-xl mb-2">Admin Access Required</h2>
          <p className="text-sm text-muted-foreground mb-4">You don't have admin privileges.</p>
          <Button asChild><Link to="/">Go Home</Link></Button>
        </Card>
      </div>
    );
  }

  const approve = async (id: string) => {
    await updateDoc(doc(db, "products", id), { status: "approved" });
    toast.success("Product approved & live");
    refresh();
  };

  const reject = async (id: string) => {
    await updateDoc(doc(db, "products", id), { status: "rejected" });
    toast.success("Product rejected");
    refresh();
  };

  const filteredProducts = allProducts.filter((p: any) =>
    p.name?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <SidebarProvider defaultOpen>
      <div className="flex min-h-screen w-full">
        <Sidebar collapsible="icon">
          <SidebarHeader className="border-b border-sidebar-border">
            <Link to="/admin" className="flex items-center gap-2 px-2 py-3">
              <div className="h-9 w-9 rounded-lg gradient-saffron flex items-center justify-center shrink-0">
                <Shield className="h-5 w-5 text-primary-foreground" />
              </div>
              <div className="group-data-[collapsible=icon]:hidden">
                <div className="font-display font-bold text-sidebar-foreground">Lanka Admin</div>
                <div className="text-xs text-sidebar-foreground/70">Control Center</div>
              </div>
            </Link>
          </SidebarHeader>

          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>Management</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {navItems.map((item) => (
                    <SidebarMenuItem key={item.key}>
                      <SidebarMenuButton isActive={section === item.key} onClick={() => setSection(item.key)} tooltip={item.label}>
                        <item.icon className="h-4 w-4" />
                        <span>{item.label}</span>
                        {item.key === "pending" && pending.length > 0 && (
                          <Badge className="ml-auto h-5 px-1.5 bg-primary text-primary-foreground">{pending.length}</Badge>
                        )}
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            <SidebarGroup>
              <SidebarGroupLabel>Site</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild tooltip="View Storefront">
                      <Link to="/"><Store className="h-4 w-4" /><span>View Storefront</span></Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>

          <SidebarFooter className="border-t border-sidebar-border">
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton onClick={() => signOut()} tooltip="Sign out">
                  <LogOut className="h-4 w-4" /><span>Sign out</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarFooter>
        </Sidebar>

        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 border-b bg-card flex items-center gap-3 px-4 sticky top-0 z-10">
            <SidebarTrigger />
            <h1 className="font-display text-lg font-semibold capitalize">
              {navItems.find((i) => i.key === section)?.label ?? "Dashboard"}
            </h1>
            <div className="ml-auto flex items-center gap-2">
              <div className="text-xs text-muted-foreground hidden sm:block">{user?.email}</div>
              <Badge variant="secondary" className="gap-1"><Shield className="h-3 w-3" /> Admin</Badge>
            </div>
          </header>

          <main className="flex-1 p-4 md:p-6 space-y-6">
            {section === "dashboard" && (
              <>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <StatCard label="Total Revenue" value={formatLKR(stats.revenue)} icon={DollarSign} accent="gradient-saffron" />
                  <StatCard label="Total Orders" value={stats.orders.toString()} sub={`${stats.pendingOrders} pending`} icon={Package} accent="gradient-royal" />
                  <StatCard label="Products" value={stats.products.toString()} sub={`${stats.pendingProducts} awaiting approval`} icon={ShoppingBag} />
                  <StatCard label="Sellers" value={stats.sellers.toString()} icon={Users} />
                </div>

                <div className="grid lg:grid-cols-2 gap-4">
                  <Card className="p-5">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-semibold flex items-center gap-2"><TrendingUp className="h-4 w-4 text-primary" /> Recent Orders</h3>
                      <Button variant="ghost" size="sm" onClick={() => setSection("orders")}>View all</Button>
                    </div>
                    <div className="space-y-2">
                      {orders.slice(0, 5).map((o) => (
                        <div key={o.id} className="flex items-center justify-between py-2 border-b last:border-0">
                          <div className="text-sm">
                            <div className="font-medium">#{o.id.slice(0, 8)}</div>
                            <div className="text-xs text-muted-foreground">{(o.createdAt?.toDate?.() ?? new Date()).toLocaleDateString("en-LK")}</div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary" className="text-xs">{o.status}</Badge>
                            <span className="font-semibold text-primary text-sm">{formatLKR(o.totalAmount)}</span>
                          </div>
                        </div>
                      ))}
                      {orders.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No orders yet</p>}
                    </div>
                  </Card>

                  <Card className="p-5">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-semibold flex items-center gap-2"><ClipboardList className="h-4 w-4 text-primary" /> Pending Approvals</h3>
                      <Button variant="ghost" size="sm" onClick={() => setSection("pending")}>Review</Button>
                    </div>
                    <div className="space-y-2">
                      {pending.slice(0, 5).map((p) => (
                        <div key={p.id} className="flex items-center gap-3 py-2 border-b last:border-0">
                          <div className="h-10 w-10 rounded bg-muted overflow-hidden shrink-0">
                            {p.imageUrl && <img src={p.imageUrl} alt={p.name} className="h-full w-full object-cover" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium truncate">{p.name}</div>
                            <div className="text-xs text-muted-foreground">{formatLKR(p.price)}</div>
                          </div>
                          <Button size="sm" variant="success" onClick={() => approve(p.id)}><Check className="h-3 w-3" /></Button>
                        </div>
                      ))}
                      {pending.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">All caught up ✨</p>}
                    </div>
                  </Card>
                </div>
              </>
            )}

            {section === "pending" && (
              <Card className="p-0 overflow-hidden">
                {pending.length === 0 ? (
                  <div className="p-12 text-center text-muted-foreground">
                    <Check className="h-10 w-10 mx-auto mb-2 text-success" />
                    All caught up! No products pending approval.
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Product</TableHead>
                        <TableHead>Seller</TableHead>
                        <TableHead>Price</TableHead>
                        <TableHead>Stock</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pending.map((p) => (
                        <TableRow key={p.id}>
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <div className="h-12 w-12 rounded bg-muted overflow-hidden shrink-0">
                                {p.imageUrl ? <img src={p.imageUrl} alt={p.name} className="h-full w-full object-cover" /> : <div className="h-full w-full flex items-center justify-center"><Package className="h-5 w-5 text-muted-foreground" /></div>}
                              </div>
                              <div className="min-w-0">
                                <div className="font-medium truncate max-w-[260px]">{p.name}</div>
                                <div className="text-xs text-muted-foreground line-clamp-1 max-w-[260px]">{p.description}</div>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm">{p.sellerProfile?.shopName ?? p.sellerProfile?.fullName ?? "—"}</TableCell>
                          <TableCell className="font-medium">{formatLKR(p.price)}</TableCell>
                          <TableCell>{p.stock}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button size="sm" variant="success" onClick={() => approve(p.id)}><Check className="h-4 w-4 mr-1" /> Approve</Button>
                              <Button size="sm" variant="outline" onClick={() => reject(p.id)}><X className="h-4 w-4 mr-1" /> Reject</Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </Card>
            )}

            {section === "products" && user && <AdminProductsSection adminUserId={user.id} />}
            {section === "banners" && <AdminBannersSection />}

            {section === "orders" && (
              <Card className="p-0 overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order</TableHead>
                      <TableHead>Items</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Payment</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orders.map((o) => {
                      const orderItems: any[] = o.items ?? [];
                      return (
                        <TableRow key={o.id}>
                          <TableCell className="align-top">
                            <div className="font-mono text-xs">#{o.id.slice(0, 8)}</div>
                            <div className="text-xs text-muted-foreground">{(o.createdAt?.toDate?.() ?? new Date()).toLocaleString("en-LK")}</div>
                          </TableCell>
                          <TableCell className="align-top">
                            <div className="space-y-1 max-w-[280px]">
                              {orderItems.map((it: any, idx: number) => (
                                <div key={idx} className="flex items-center gap-2">
                                  <div className="min-w-0 text-xs">
                                    <div className="font-medium truncate">{it.productName}</div>
                                    <div className="text-muted-foreground">× {it.quantity} · {formatLKR(it.unitPrice)}</div>
                                  </div>
                                </div>
                              ))}
                              {orderItems.length === 0 && <span className="text-xs text-muted-foreground">No items</span>}
                            </div>
                          </TableCell>
                          <TableCell className="text-sm align-top">
                            <div className="font-medium">{o.customerName ?? "—"}</div>
                            <div className="text-xs text-muted-foreground">{o.customerEmail ?? ""}</div>
                            <div className="text-xs text-muted-foreground mt-1">📞 {o.shippingPhone}</div>
                            <div className="text-xs text-muted-foreground mt-1 max-w-[220px]">📍 {o.shippingAddress}</div>
                            {o.notes && <div className="text-xs text-muted-foreground mt-1 italic max-w-[220px]">📝 {o.notes}</div>}
                          </TableCell>
                          <TableCell className="text-sm uppercase align-top">{o.paymentMethod}</TableCell>
                          <TableCell className="align-top">
                            <Badge variant={o.status === "delivered" ? "default" : o.status === "cancelled" ? "destructive" : "secondary"}>{o.status}</Badge>
                          </TableCell>
                          <TableCell className="text-right font-bold text-primary align-top">{formatLKR(o.totalAmount)}</TableCell>
                          <TableCell className="text-right align-top">
                            <div className="flex flex-col gap-1 items-end">
                              <Button size="sm" variant="outline" onClick={() => generateReceiptPDF(o)}><FileDown className="h-3 w-3 mr-1" /> Receipt</Button>
                              {o.status === "pending" && <Button size="sm" variant="success" onClick={() => updateOrderStatus(o.id, "confirmed")}><Check className="h-3 w-3 mr-1" /> Approve</Button>}
                              {o.status === "confirmed" && <Button size="sm" onClick={() => updateOrderStatus(o.id, "shipped")}>Ship</Button>}
                              {o.status === "shipped" && <Button size="sm" variant="success" onClick={() => updateOrderStatus(o.id, "delivered")}>Mark Delivered</Button>}
                              {o.status !== "delivered" && o.status !== "cancelled" && (
                                <Button size="sm" variant="outline" onClick={() => updateOrderStatus(o.id, "cancelled")}><X className="h-3 w-3 mr-1" /> Cancel</Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {orders.length === 0 && (
                      <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No orders yet</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </Card>
            )}

            {section === "sellers" && (
              <Card className="p-0 overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Shop</TableHead>
                      <TableHead>Owner</TableHead>
                      <TableHead>Email</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sellers.map((s: any) => (
                      <TableRow key={s.id}>
                        <TableCell className="font-medium">{s.shopName ?? "—"}</TableCell>
                        <TableCell>{s.fullName ?? "—"}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{s.email ?? "—"}</TableCell>
                      </TableRow>
                    ))}
                    {sellers.length === 0 && (
                      <TableRow><TableCell colSpan={3} className="text-center py-8 text-muted-foreground">No sellers yet</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </Card>
            )}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
};

const StatCard = ({ label, value, sub, icon: Icon, accent }: { label: string; value: string; sub?: string; icon: any; accent?: string; }) => (
  <Card className="p-5 relative overflow-hidden">
    <div className="flex items-start justify-between">
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
        <p className="text-2xl font-bold mt-1 font-display truncate">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </div>
      <div className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${accent ?? "bg-muted"}`}>
        <Icon className={`h-5 w-5 ${accent ? "text-primary-foreground" : "text-muted-foreground"}`} />
      </div>
    </div>
  </Card>
);

export default AdminPanel;
