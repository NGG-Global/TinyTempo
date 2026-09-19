package com.tinytempo.app;

import android.app.Activity;

import androidx.annotation.NonNull;

import com.android.billingclient.api.AcknowledgePurchaseParams;
import com.android.billingclient.api.BillingClient;
import com.android.billingclient.api.BillingClientStateListener;
import com.android.billingclient.api.BillingFlowParams;
import com.android.billingclient.api.BillingResult;
import com.android.billingclient.api.ConsumeParams;
import com.android.billingclient.api.PendingPurchasesParams;
import com.android.billingclient.api.ProductDetails;
import com.android.billingclient.api.Purchase;
import com.android.billingclient.api.PurchasesUpdatedListener;
import com.android.billingclient.api.QueryProductDetailsParams;
import com.android.billingclient.api.QueryPurchasesParams;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Google Play Billing, exposed to the web layer.
 *
 * This is a bridge and nothing more: it starts a BillingClient, relays what Play says, and
 * performs the two acts Play requires of a client — acknowledge and consume — when the
 * TypeScript adapter asks. Every decision about what a purchase means to the game
 * (whether to grant, whether it has already been granted, whether Premium is still owned)
 * lives in {@code src/monetization/playBilling.ts}, where it can be tested without a device.
 *
 * Nothing here logs a purchase token, an order id or any other purchase detail.
 *
 * @see <a href="https://developer.android.com/google/play/billing/integrate">Play Billing integration</a>
 */
@CapacitorPlugin(name = "PlayBilling")
public class PlayBillingPlugin extends Plugin implements PurchasesUpdatedListener {

    /** Play's own name for a one-time product, as opposed to a subscription. */
    private static final String ONE_TIME = BillingClient.ProductType.INAPP;

    private BillingClient billingClient;

    /**
     * ProductDetails from the last successful query, by product id. launchBillingFlow needs
     * the object Play handed back, not just the id, so the query has to be remembered.
     */
    private final Map<String, ProductDetails> productDetails = new ConcurrentHashMap<>();

    @Override
    public void load() {
        billingClient = BillingClient
                .newBuilder(getContext())
                .setListener(this)
                // One-time products can be paid for by slower methods that settle later;
                // without this Play rejects those purchases rather than reporting PENDING.
                .enablePendingPurchases(
                        PendingPurchasesParams.newBuilder().enableOneTimeProducts().build())
                // The library re-establishes a dropped service connection itself, so the
                // web layer never has to model a reconnect.
                .enableAutoServiceReconnection()
                .build();
    }

    @Override
    protected void handleOnDestroy() {
        if (billingClient != null) {
            billingClient.endConnection();
            billingClient = null;
        }
        super.handleOnDestroy();
    }

    @PluginMethod
    public void connect(final PluginCall call) {
        final BillingClient client = billingClient;
        if (client == null) {
            call.reject("Billing is not available on this device.");
            return;
        }
        if (client.isReady()) {
            call.resolve();
            return;
        }
        client.startConnection(new BillingClientStateListener() {
            @Override
            public void onBillingSetupFinished(@NonNull BillingResult billingResult) {
                if (billingResult.getResponseCode() == BillingClient.BillingResponseCode.OK) {
                    call.resolve();
                } else {
                    // The code is the whole message: the adapter maps it onto what the
                    // player is told, and Play's own text is not for a game's UI.
                    call.reject("billing-setup-" + billingResult.getResponseCode());
                }
            }

            @Override
            public void onBillingServiceDisconnected() {
                // enableAutoServiceReconnection handles the retry. A connect() still in
                // flight is settled by onBillingSetupFinished either way.
            }
        });
    }

    @PluginMethod
    public void queryProducts(final PluginCall call) {
        final BillingClient client = billingClient;
        if (client == null) {
            call.reject("Billing is not available on this device.");
            return;
        }
        final JSArray requested = call.getArray("productIds");
        final List<QueryProductDetailsParams.Product> products = new ArrayList<>();
        if (requested != null) {
            for (int index = 0; index < requested.length(); index += 1) {
                final String id = requested.optString(index, "");
                if (!id.isEmpty()) {
                    products.add(QueryProductDetailsParams.Product
                            .newBuilder()
                            .setProductId(id)
                            .setProductType(ONE_TIME)
                            .build());
                }
            }
        }
        if (products.isEmpty()) {
            call.reject("bad-product-list");
            return;
        }

        client.queryProductDetailsAsync(
                QueryProductDetailsParams.newBuilder().setProductList(products).build(),
                (billingResult, queryResult) -> {
                    if (billingResult.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                        call.reject("product-query-" + billingResult.getResponseCode());
                        return;
                    }
                    final JSArray found = new JSArray();
                    for (ProductDetails details : queryResult.getProductDetailsList()) {
                        productDetails.put(details.getProductId(), details);
                        final ProductDetails.OneTimePurchaseOfferDetails offer = firstOffer(details);
                        if (offer == null) continue;
                        final JSObject item = new JSObject();
                        item.put("productId", details.getProductId());
                        // Play's localized price. The game never formats a price itself,
                        // which is why an offer without one is left out entirely.
                        item.put("formattedPrice", offer.getFormattedPrice());
                        found.put(item);
                    }
                    final JSObject result = new JSObject();
                    result.put("products", found);
                    call.resolve(result);
                });
    }

    @PluginMethod
    public void queryPurchases(final PluginCall call) {
        final BillingClient client = billingClient;
        if (client == null) {
            call.reject("Billing is not available on this device.");
            return;
        }
        client.queryPurchasesAsync(
                QueryPurchasesParams.newBuilder().setProductType(ONE_TIME).build(),
                (billingResult, purchases) -> {
                    if (billingResult.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                        // A rejection is not "owns nothing": the adapter must be able to
                        // tell a failed question from a negative answer, because only the
                        // second one may revoke Premium.
                        call.reject("purchase-query-" + billingResult.getResponseCode());
                        return;
                    }
                    final JSObject result = new JSObject();
                    result.put("purchases", describePurchases(purchases));
                    call.resolve(result);
                });
    }

    @PluginMethod
    public void launchPurchase(final PluginCall call) {
        final BillingClient client = billingClient;
        final Activity activity = getActivity();
        if (client == null || activity == null) {
            call.reject("Billing is not available on this device.");
            return;
        }
        final String productId = call.getString("productId", "");
        final ProductDetails details = productId == null ? null : productDetails.get(productId);
        if (details == null) {
            final JSObject result = new JSObject();
            result.put("code", BillingClient.BillingResponseCode.ITEM_UNAVAILABLE);
            call.resolve(result);
            return;
        }
        final ProductDetails.OneTimePurchaseOfferDetails offer = firstOffer(details);
        if (offer == null) {
            final JSObject result = new JSObject();
            result.put("code", BillingClient.BillingResponseCode.ITEM_UNAVAILABLE);
            call.resolve(result);
            return;
        }

        final BillingFlowParams params = BillingFlowParams
                .newBuilder()
                .setProductDetailsParamsList(Collections.singletonList(
                        BillingFlowParams.ProductDetailsParams
                                .newBuilder()
                                .setProductDetails(details)
                                // Required for one-time products since Billing Library 8,
                                // which gave them purchase options and offers of their own.
                                .setOfferToken(offer.getOfferToken())
                                .build()))
                .build();

        // launchBillingFlow shows an Activity, so it belongs on the UI thread; Capacitor
        // runs plugin methods off it.
        activity.runOnUiThread(() -> {
            final BillingResult billingResult = client.launchBillingFlow(activity, params);
            final JSObject result = new JSObject();
            // Only says whether the sheet opened. The outcome arrives at onPurchasesUpdated.
            result.put("code", billingResult.getResponseCode());
            call.resolve(result);
        });
    }

    @PluginMethod
    public void acknowledge(final PluginCall call) {
        final BillingClient client = billingClient;
        final String purchaseToken = call.getString("purchaseToken", "");
        if (client == null || purchaseToken == null || purchaseToken.isEmpty()) {
            call.reject("bad-acknowledge-request");
            return;
        }
        client.acknowledgePurchase(
                AcknowledgePurchaseParams.newBuilder().setPurchaseToken(purchaseToken).build(),
                billingResult -> {
                    if (billingResult.getResponseCode() == BillingClient.BillingResponseCode.OK) {
                        call.resolve();
                    } else {
                        call.reject("acknowledge-" + billingResult.getResponseCode());
                    }
                });
    }

    @PluginMethod
    public void consume(final PluginCall call) {
        final BillingClient client = billingClient;
        final String purchaseToken = call.getString("purchaseToken", "");
        if (client == null || purchaseToken == null || purchaseToken.isEmpty()) {
            call.reject("bad-consume-request");
            return;
        }
        // Consuming a one-time product also acknowledges it, so a consumable is never
        // acknowledged separately.
        client.consumeAsync(
                ConsumeParams.newBuilder().setPurchaseToken(purchaseToken).build(),
                (billingResult, token) -> {
                    if (billingResult.getResponseCode() == BillingClient.BillingResponseCode.OK) {
                        call.resolve();
                    } else {
                        call.reject("consume-" + billingResult.getResponseCode());
                    }
                });
    }

    @Override
    public void onPurchasesUpdated(@NonNull BillingResult billingResult, List<Purchase> purchases) {
        final JSObject payload = new JSObject();
        payload.put("code", billingResult.getResponseCode());
        payload.put("purchases", describePurchases(purchases));
        notifyListeners("purchasesUpdated", payload);
    }

    /**
     * The first offer on a one-time product. Billing Library 8 let a one-time product carry
     * several, and the list is the current accessor; the single getter is the older shape of
     * the same thing and covers a product that has not been given explicit offers.
     */
    private static ProductDetails.OneTimePurchaseOfferDetails firstOffer(ProductDetails details) {
        final List<ProductDetails.OneTimePurchaseOfferDetails> offers =
                details.getOneTimePurchaseOfferDetailsList();
        if (offers != null && !offers.isEmpty()) return offers.get(0);
        return details.getOneTimePurchaseOfferDetails();
    }

    /** Only the fields the game acts on. No order id, and nothing that is not needed. */
    private static JSArray describePurchases(List<Purchase> purchases) {
        final JSArray described = new JSArray();
        if (purchases == null) return described;
        for (Purchase purchase : purchases) {
            final JSArray productIds = new JSArray();
            for (String productId : purchase.getProducts()) productIds.put(productId);
            final JSObject item = new JSObject();
            item.put("productIds", productIds);
            item.put("purchaseToken", purchase.getPurchaseToken());
            item.put("state", describeState(purchase.getPurchaseState()));
            item.put("acknowledged", purchase.isAcknowledged());
            described.put(item);
        }
        return described;
    }

    private static String describeState(int purchaseState) {
        if (purchaseState == Purchase.PurchaseState.PURCHASED) return "purchased";
        if (purchaseState == Purchase.PurchaseState.PENDING) return "pending";
        return "unspecified";
    }
}
