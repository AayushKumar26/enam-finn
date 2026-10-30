.class public Lcom/finn/app/Bridge;
.super Ljava/lang/Object;

# Exposed to JS as window.FINNNative. Network runs on a worker thread; result returns via Eval.

.field private final web:Landroid/webkit/WebView;

.method public constructor <init>(Landroid/webkit/WebView;)V
    .locals 0
    invoke-direct {p0}, Ljava/lang/Object;-><init>()V
    iput-object p1, p0, Lcom/finn/app/Bridge;->web:Landroid/webkit/WebView;
    return-void
.end method

.method public request(Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;Z)V
    .locals 2
    .annotation runtime Landroid/webkit/JavascriptInterface;
    .end annotation

    :try_start_0
    new-instance v0, Lcom/finn/app/Fetcher;
    iget-object v1, p0, Lcom/finn/app/Bridge;->web:Landroid/webkit/WebView;
    invoke-direct {v0, v1, p1, p2, p3}, Lcom/finn/app/Fetcher;-><init>(Landroid/webkit/WebView;Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;)V
    iput-boolean p4, v0, Lcom/finn/app/Fetcher;->binary:Z
    new-instance v1, Ljava/lang/Thread;
    invoke-direct {v1, v0}, Ljava/lang/Thread;-><init>(Ljava/lang/Runnable;)V
    invoke-virtual {v1}, Ljava/lang/Thread;->start()V
    :try_end_0
    .catch Ljava/lang/Throwable; {:try_start_0 .. :try_end_0} :catch_0

    :catch_0
    return-void
.end method

.method public postAlert(Ljava/lang/String;Ljava/lang/String;I)V
    .locals 1
    .annotation runtime Landroid/webkit/JavascriptInterface;
    .end annotation

    :try_start_0
    iget-object v0, p0, Lcom/finn/app/Bridge;->web:Landroid/webkit/WebView;
    invoke-virtual {v0}, Landroid/webkit/WebView;->getContext()Landroid/content/Context;
    move-result-object v0
    invoke-static {v0, p3, p1, p2}, Lcom/finn/app/Notif;->show(Landroid/content/Context;ILjava/lang/String;Ljava/lang/String;)V
    :try_end_0
    .catch Ljava/lang/Throwable; {:try_start_0 .. :try_end_0} :catch_0

    :catch_0
    return-void
.end method
