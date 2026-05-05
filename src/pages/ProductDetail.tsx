import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { doc, getDoc, collection, getDocs, query, where, limit } from "firebase/firestore";
import { db } from "@/integrations/firebase/config";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  ShoppingCart,
  Package,
  Store,
  Truck,
  Shield,
  RotateCcw,
  Heart,
  Share2,
  Star,
  ChevronRight,
  Zap,
  CheckCircle2,
} from "lucide-react";
import { formatLKR } from "@/lib/format";
import { useCart } from "@/hooks/useCart";
import { ProductCard } from "@/components/ProductCard";
import { toast } from "sonner";

const ProductDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [product, setProduct] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [qty, setQty] = useState(1);
  const [wishlisted, setWishlisted] = useState(false);
  const [related, setRelated] = useState<any[]>([]);
  const [activeImage, setActiveImage] = useState<string>("");
  const [selectedVariants, setSelectedVariants] = useState<Record<string, string>>({});
  const { add } = useCart();

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    setProduct(null);
    setRelated([]);
    setActiveImage("");
    setSelectedVariants({});
    setQty(1);
    window.scrollTo(0, 0);

    (async () => {
      const snap = await getDoc(doc(db, "products", id));
      if (cancelled) return;

      if (!snap.exists()) {
        setLoading(false);
        return;
      }

      const data = snap.data();

      // Load category
      let categoryData: { name: string; slug: string } | null = null;
      if (data.categoryId) {
        const cSnap = await getDoc(doc(db, "categories", data.categoryId));
        if (cSnap.exists()) categoryData = cSnap.data() as any;
      }

      // Load seller profile
      let sellerProfile: { fullName: string | null; shopName: string | null } | null = null;
      if (data.sellerId) {
        const sSnap = await getDoc(doc(db, "users", data.sellerId));
        if (sSnap.exists()) {
          const s = sSnap.data();
          sellerProfile = { fullName: s.fullName ?? null, shopName: s.shopName ?? null };
        }
      }

      // Load related products
      let relatedDocs: any[] = [];
      if (data.categoryId) {
        const rSnap = await getDocs(
          query(
            collection(db, "products"),
            where("status", "==", "approved"),
            where("categoryId", "==", data.categoryId),
            limit(7)
          )
        );
        relatedDocs = rSnap.docs
          .filter((d) => d.id !== id)
          .slice(0, 6)
          .map((d) => {
            const rd = d.data();
            return {
              id: d.id,
              name: rd.name,
              price: rd.price,
              image_url: rd.imageUrl ?? null,
              stock: rd.stock,
              is_trending: rd.isTrending ?? false,
              original_price: rd.originalPrice ?? null,
            };
          });
      }

      if (cancelled) return;

      setProduct({
        id: snap.id,
        name: data.name,
        description: data.description ?? null,
        price: data.price,
        originalPrice: data.originalPrice ?? null,
        stock: data.stock,
        imageUrl: data.imageUrl ?? null,
        images: data.images ?? [],
        brand: data.brand ?? null,
        sku: data.sku ?? null,
        specifications: data.specifications ?? {},
        variants: data.variants ?? [],
        categories: categoryData,
        sellerProfile,
      });
      setRelated(relatedDocs);
      setActiveImage(data.imageUrl ?? (data.images?.[0] ?? ""));
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [id]);

  if (loading) return <div className="container py-12 text-center">Loading...</div>;
  if (!product)
    return (
      <div className="container py-12 text-center">
        Product not found.{" "}
        <Link to="/products" className="text-primary">Browse all</Link>
      </div>
    );

  const rating = 4.5;
  const reviewCount = Math.floor(Math.random() * 500) + 20;
  const soldCount = Math.floor(Math.random() * 1000) + 50;
  const hasOriginal = product.originalPrice && Number(product.originalPrice) > Number(product.price);
  const originalPrice = hasOriginal ? Number(product.originalPrice) : Number(product.price) * 1.25;
  const discountPct = Math.round(((originalPrice - product.price) / originalPrice) * 100);
  const gallery: string[] = [
    ...(product.imageUrl ? [product.imageUrl] : []),
    ...((product.images ?? []) as string[]).filter((u: string) => u !== product.imageUrl),
  ];
  const specEntries = Object.entries(product.specifications ?? {});
  const variants: { name: string; values: string[] }[] = product.variants ?? [];

  const handleBuyNow = async () => {
    await add(product.id, qty);
    navigate("/checkout");
  };

  const handleShare = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try { await navigator.share({ title: product.name, url }); } catch {}
    } else {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied!");
    }
  };

  const toggleWishlist = () => {
    setWishlisted((w) => !w);
    toast.success(wishlisted ? "Removed from wishlist" : "Added to wishlist");
  };

  return (
    <div className="bg-muted/30 min-h-screen pb-24 md:pb-8">
      {/* Breadcrumbs */}
      <div className="container pt-4">
        <nav className="flex items-center gap-1 text-xs text-muted-foreground flex-wrap">
          <Link to="/" className="hover:text-primary transition-smooth">Home</Link>
          <ChevronRight className="h-3 w-3" />
          <Link to="/products" className="hover:text-primary transition-smooth">Products</Link>
          {product.categories && (
            <>
              <ChevronRight className="h-3 w-3" />
              <Link to={`/products?category=${product.categories.slug}`} className="hover:text-primary transition-smooth">
                {product.categories.name}
              </Link>
            </>
          )}
          <ChevronRight className="h-3 w-3" />
          <span className="text-foreground line-clamp-1">{product.name}</span>
        </nav>
      </div>

      <div className="container py-4">
        <div className="grid lg:grid-cols-[1fr_1.2fr_320px] gap-4">
          {/* Image gallery */}
          <div className="lg:sticky lg:top-20 self-start space-y-2">
            <Card className="aspect-square overflow-hidden bg-background">
              {activeImage ? (
                <img src={activeImage} alt={product.name} className="w-full h-full object-contain" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Package className="h-24 w-24 text-muted-foreground" />
                </div>
              )}
            </Card>
            {gallery.length > 1 && (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {gallery.map((url, i) => (
                  <button
                    key={i}
                    onMouseEnter={() => setActiveImage(url)}
                    onClick={() => setActiveImage(url)}
                    className={`shrink-0 h-16 w-16 rounded-lg overflow-hidden border-2 transition-smooth ${activeImage === url ? "border-primary" : "border-transparent hover:border-muted-foreground/40"}`}
                  >
                    <img src={url} alt="" className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Details */}
          <Card className="p-5 space-y-4 bg-background">
            <div className="flex items-start justify-between gap-2">
              <h1 className="font-display text-xl md:text-2xl leading-snug flex-1">{product.name}</h1>
              <div className="flex gap-1 shrink-0">
                <Button variant="ghost" size="icon" onClick={toggleWishlist}>
                  <Heart className={`h-5 w-5 ${wishlisted ? "fill-primary text-primary" : ""}`} />
                </Button>
                <Button variant="ghost" size="icon" onClick={handleShare}>
                  <Share2 className="h-5 w-5" />
                </Button>
              </div>
            </div>

            {(product.brand || product.sku) && (
              <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                {product.brand && <span>Brand: <span className="text-foreground font-medium">{product.brand}</span></span>}
                {product.brand && product.sku && <Separator orientation="vertical" className="h-3" />}
                {product.sku && <span>SKU: <span className="text-foreground font-medium">{product.sku}</span></span>}
              </div>
            )}

            <div className="flex items-center gap-3 text-sm flex-wrap">
              <div className="flex items-center gap-1">
                <div className="flex">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <Star key={s} className={`h-4 w-4 ${s <= Math.round(rating) ? "fill-primary text-primary" : "text-muted-foreground"}`} />
                  ))}
                </div>
                <span className="font-medium">{rating}</span>
              </div>
              <Separator orientation="vertical" className="h-4" />
              <span className="text-muted-foreground">{reviewCount} ratings</span>
              <Separator orientation="vertical" className="h-4" />
              <span className="text-muted-foreground">{soldCount} sold</span>
            </div>

            <div className="bg-gradient-to-r from-primary/10 to-transparent rounded-lg p-4 space-y-1">
              <div className="flex items-baseline gap-3 flex-wrap">
                <span className="text-3xl font-display font-bold text-primary">{formatLKR(product.price)}</span>
                <span className="text-muted-foreground line-through text-sm">{formatLKR(originalPrice)}</span>
                <Badge className="bg-destructive text-destructive-foreground">-{discountPct}%</Badge>
              </div>
              <p className="text-xs text-muted-foreground">Inclusive of all taxes</p>
            </div>

            <div className="flex items-center gap-2 text-sm">
              {product.stock > 0 ? (
                <>
                  <CheckCircle2 className="h-4 w-4 text-success" />
                  <span className="text-success font-medium">In Stock</span>
                  <span className="text-muted-foreground">({product.stock} available)</span>
                </>
              ) : (
                <>
                  <Package className="h-4 w-4 text-destructive" />
                  <span className="text-destructive font-medium">Out of stock</span>
                </>
              )}
            </div>

            <Separator />

            <div>
              <h3 className="font-semibold mb-2">Product Description</h3>
              <p className="text-sm text-muted-foreground whitespace-pre-line">
                {product.description || "No description provided."}
              </p>
            </div>

            {specEntries.length > 0 && (
              <>
                <Separator />
                <div>
                  <h3 className="font-semibold mb-2">Specifications</h3>
                  <div className="border rounded-lg overflow-hidden">
                    {specEntries.map(([k, v], i) => (
                      <div key={k} className={`grid grid-cols-[140px_1fr] text-sm ${i % 2 === 0 ? "bg-muted/40" : "bg-background"}`}>
                        <div className="p-2.5 text-muted-foreground border-r">{k}</div>
                        <div className="p-2.5">{String(v)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {variants.length > 0 && (
              <>
                <Separator />
                <div className="space-y-3">
                  {variants.map((v) => (
                    <div key={v.name}>
                      <div className="text-sm font-medium mb-1.5">
                        {v.name}: <span className="text-muted-foreground font-normal">{selectedVariants[v.name] || "Select"}</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {v.values.map((val) => {
                          const active = selectedVariants[v.name] === val;
                          return (
                            <button
                              key={val}
                              type="button"
                              onClick={() => setSelectedVariants((s) => ({ ...s, [v.name]: val }))}
                              className={`px-3 py-1.5 text-sm rounded-lg border-2 transition-smooth ${active ? "border-primary bg-primary/10 text-primary font-medium" : "border-border hover:border-primary/50"}`}
                            >
                              {val}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            <Separator />

            {product.stock > 0 && (
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium">Quantity:</span>
                <div className="flex items-center border rounded-lg">
                  <button onClick={() => setQty(Math.max(1, qty - 1))} className="px-3 py-1.5 hover:bg-muted transition-smooth">−</button>
                  <span className="px-4 font-medium min-w-[2.5rem] text-center">{qty}</span>
                  <button onClick={() => setQty(Math.min(product.stock, qty + 1))} className="px-3 py-1.5 hover:bg-muted transition-smooth">+</button>
                </div>
              </div>
            )}

            {product.stock > 0 && (
              <div className="hidden md:flex items-center gap-3 pt-2">
                <Button variant="outline" size="lg" className="flex-1" onClick={() => add(product.id, qty)}>
                  <ShoppingCart className="h-5 w-5 mr-2" /> Add to Cart
                </Button>
                <Button variant="hero" size="lg" className="flex-1" onClick={handleBuyNow}>
                  <Zap className="h-5 w-5 mr-2" /> Buy Now
                </Button>
              </div>
            )}
          </Card>

          {/* Right: Seller + Delivery */}
          <div className="space-y-4">
            <Card className="p-4 space-y-3 bg-background">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-secondary/10 flex items-center justify-center">
                  <Store className="h-5 w-5 text-secondary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-muted-foreground">Sold by</div>
                  <div className="font-semibold truncate">
                    {product.sellerProfile?.shopName || product.sellerProfile?.fullName || "ARTIXO Seller"}
                  </div>
                </div>
              </div>
              <Separator />
              <div className="space-y-2.5 text-sm">
                <div className="flex items-start gap-2">
                  <Truck className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                  <div><div className="font-medium">Island-wide Delivery</div><div className="text-xs text-muted-foreground">Delivered in 2-5 business days</div></div>
                </div>
                <div className="flex items-start gap-2">
                  <Shield className="h-4 w-4 text-success mt-0.5 shrink-0" />
                  <div><div className="font-medium">Cash on Delivery</div><div className="text-xs text-muted-foreground">Pay when you receive</div></div>
                </div>
                <div className="flex items-start gap-2">
                  <RotateCcw className="h-4 w-4 text-secondary mt-0.5 shrink-0" />
                  <div><div className="font-medium">7-Day Returns</div><div className="text-xs text-muted-foreground">Easy refund if damaged</div></div>
                </div>
              </div>
            </Card>
          </div>
        </div>

        {related.length > 0 && (
          <div className="mt-8">
            <h2 className="font-display text-2xl mb-4">You may also like</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              {related.map((r) => <ProductCard key={r.id} p={r} />)}
            </div>
          </div>
        )}
      </div>

      {product.stock > 0 && (
        <div className="md:hidden fixed bottom-0 left-0 right-0 bg-background border-t p-3 flex gap-2 z-50 shadow-lg">
          <Button variant="outline" className="flex-1" onClick={() => add(product.id, qty)}>
            <ShoppingCart className="h-4 w-4 mr-1" /> Cart
          </Button>
          <Button variant="hero" className="flex-1" onClick={handleBuyNow}>
            <Zap className="h-4 w-4 mr-1" /> Buy Now
          </Button>
        </div>
      )}
    </div>
  );
};

export default ProductDetail;
