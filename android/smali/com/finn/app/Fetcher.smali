.class public Lcom/finn/app/Fetcher;
.super Ljava/lang/Object;
.implements Ljava/lang/Runnable;

.field public web:Landroid/webkit/WebView;
.field public id:Ljava/lang/String;
.field public url:Ljava/lang/String;
.field public headers:Ljava/lang/String;
.field public binary:Z

.method public constructor <init>(Landroid/webkit/WebView;Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;)V
    .locals 0
    invoke-direct {p0}, Ljava/lang/Object;-><init>()V
    iput-object p1, p0, Lcom/finn/app/Fetcher;->web:Landroid/webkit/WebView;
    iput-object p2, p0, Lcom/finn/app/Fetcher;->id:Ljava/lang/String;
    iput-object p3, p0, Lcom/finn/app/Fetcher;->url:Ljava/lang/String;
    iput-object p4, p0, Lcom/finn/app/Fetcher;->headers:Ljava/lang/String;
    return-void
.end method

.method public run()V
    .locals 12

    :try_start_0
    new-instance v1, Ljava/net/URL;
    iget-object v2, p0, Lcom/finn/app/Fetcher;->url:Ljava/lang/String;
    invoke-direct {v1, v2}, Ljava/net/URL;-><init>(Ljava/lang/String;)V
    invoke-virtual {v1}, Ljava/net/URL;->openConnection()Ljava/net/URLConnection;
    move-result-object v0
    check-cast v0, Ljava/net/HttpURLConnection;

    const/16 v1, 0x4e20
    invoke-virtual {v0, v1}, Ljava/net/HttpURLConnection;->setConnectTimeout(I)V
    const/16 v1, 0x7530
    invoke-virtual {v0, v1}, Ljava/net/HttpURLConnection;->setReadTimeout(I)V

    const-string v1, "User-Agent"
    const-string v2, "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36"
    invoke-virtual {v0, v1, v2}, Ljava/net/HttpURLConnection;->setRequestProperty(Ljava/lang/String;Ljava/lang/String;)V

    new-instance v3, Lorg/json/JSONObject;
    iget-object v1, p0, Lcom/finn/app/Fetcher;->headers:Ljava/lang/String;
    invoke-direct {v3, v1}, Lorg/json/JSONObject;-><init>(Ljava/lang/String;)V
    invoke-virtual {v3}, Lorg/json/JSONObject;->keys()Ljava/util/Iterator;
    move-result-object v4

    :hloop
    invoke-interface {v4}, Ljava/util/Iterator;->hasNext()Z
    move-result v1
    if-eqz v1, :hdone
    invoke-interface {v4}, Ljava/util/Iterator;->next()Ljava/lang/Object;
    move-result-object v5
    check-cast v5, Ljava/lang/String;
    invoke-virtual {v3, v5}, Lorg/json/JSONObject;->getString(Ljava/lang/String;)Ljava/lang/String;
    move-result-object v2
    invoke-virtual {v0, v5, v2}, Ljava/net/HttpURLConnection;->setRequestProperty(Ljava/lang/String;Ljava/lang/String;)V
    goto :hloop

    :hdone
    invoke-virtual {v0}, Ljava/net/HttpURLConnection;->getResponseCode()I
    move-result v6
    const/16 v1, 0x190
    if-lt v6, v1, :okstream
    invoke-virtual {v0}, Ljava/net/HttpURLConnection;->getErrorStream()Ljava/io/InputStream;
    move-result-object v7
    goto :gotstream
    :okstream
    invoke-virtual {v0}, Ljava/net/HttpURLConnection;->getInputStream()Ljava/io/InputStream;
    move-result-object v7
    :gotstream

    new-instance v8, Ljava/io/ByteArrayOutputStream;
    invoke-direct {v8}, Ljava/io/ByteArrayOutputStream;-><init>()V
    if-eqz v7, :readdone
    const/16 v1, 0x2000
    new-array v9, v1, [B
    :rloop
    invoke-virtual {v7, v9}, Ljava/io/InputStream;->read([B)I
    move-result v10
    if-ltz v10, :rclose
    const/4 v1, 0x0
    invoke-virtual {v8, v9, v1, v10}, Ljava/io/ByteArrayOutputStream;->write([BII)V
    goto :rloop
    :rclose
    invoke-virtual {v7}, Ljava/io/InputStream;->close()V
    :readdone

    invoke-virtual {v8}, Ljava/io/ByteArrayOutputStream;->toByteArray()[B
    move-result-object v9
    iget-boolean v1, p0, Lcom/finn/app/Fetcher;->binary:Z
    if-eqz v1, :astext
    const/4 v1, 0x2
    invoke-static {v9, v1}, Landroid/util/Base64;->encodeToString([BI)Ljava/lang/String;
    move-result-object v11
    goto :built
    :astext
    new-instance v11, Ljava/lang/String;
    const-string v1, "UTF-8"
    invoke-direct {v11, v9, v1}, Ljava/lang/String;-><init>([BLjava/lang/String;)V
    :built

    new-instance v1, Ljava/lang/StringBuilder;
    invoke-direct {v1}, Ljava/lang/StringBuilder;-><init>()V
    const-string v2, "FINNNative_cb("
    invoke-virtual {v1, v2}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;
    iget-object v2, p0, Lcom/finn/app/Fetcher;->id:Ljava/lang/String;
    invoke-static {v2}, Lorg/json/JSONObject;->quote(Ljava/lang/String;)Ljava/lang/String;
    move-result-object v2
    invoke-virtual {v1, v2}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;
    const-string v2, ","
    invoke-virtual {v1, v2}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;
    invoke-virtual {v1, v6}, Ljava/lang/StringBuilder;->append(I)Ljava/lang/StringBuilder;
    const-string v2, ","
    invoke-virtual {v1, v2}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;
    invoke-static {v11}, Lorg/json/JSONObject;->quote(Ljava/lang/String;)Ljava/lang/String;
    move-result-object v2
    invoke-virtual {v1, v2}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;
    const-string v2, ")"
    invoke-virtual {v1, v2}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;
    invoke-virtual {v1}, Ljava/lang/StringBuilder;->toString()Ljava/lang/String;
    move-result-object v11
    :try_end_0
    .catch Ljava/lang/Throwable; {:try_start_0 .. :try_end_0} :catch_0
    goto :post

    :catch_0
    move-exception v1
    invoke-static {v1}, Ljava/lang/String;->valueOf(Ljava/lang/Object;)Ljava/lang/String;
    move-result-object v2
    invoke-static {v2}, Lorg/json/JSONObject;->quote(Ljava/lang/String;)Ljava/lang/String;
    move-result-object v2
    iget-object v3, p0, Lcom/finn/app/Fetcher;->id:Ljava/lang/String;
    invoke-static {v3}, Lorg/json/JSONObject;->quote(Ljava/lang/String;)Ljava/lang/String;
    move-result-object v3
    new-instance v11, Ljava/lang/StringBuilder;
    invoke-direct {v11}, Ljava/lang/StringBuilder;-><init>()V
    const-string v4, "FINNNative_cb("
    invoke-virtual {v11, v4}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;
    invoke-virtual {v11, v3}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;
    const-string v4, ",0,"
    invoke-virtual {v11, v4}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;
    invoke-virtual {v11, v2}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;
    const-string v4, ")"
    invoke-virtual {v11, v4}, Ljava/lang/StringBuilder;->append(Ljava/lang/String;)Ljava/lang/StringBuilder;
    invoke-virtual {v11}, Ljava/lang/StringBuilder;->toString()Ljava/lang/String;
    move-result-object v11

    :post
    :try_start_1
    iget-object v0, p0, Lcom/finn/app/Fetcher;->web:Landroid/webkit/WebView;
    new-instance v1, Lcom/finn/app/Eval;
    invoke-direct {v1, v0, v11}, Lcom/finn/app/Eval;-><init>(Landroid/webkit/WebView;Ljava/lang/String;)V
    invoke-virtual {v0, v1}, Landroid/webkit/WebView;->post(Ljava/lang/Runnable;)Z
    :try_end_1
    .catch Ljava/lang/Throwable; {:try_start_1 .. :try_end_1} :catch_1

    :catch_1
    return-void
.end method
