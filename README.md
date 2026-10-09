# SingFlex(K's VOX RECORD 専用カラオケ)

- 生徒用: https://singflex.ksvox.net (門弟アプリの通行証で開く)
- 管理画面: https://singflex.ksvox.net/admin

## 3つの部屋
- `/` コントロールルーム(曲名検索・取扱説明書・Showcaseへのリンク)
- `/booth/[id]` ブース(カラオケ)
- `/lounge/[id]` 控え室(英語歌唱メソッドの歌詞メモ/和訳)

## デプロイナウの環境変数
| 名前 | 中身 |
|---|---|
| FIREBASE_CLIENT_EMAIL | 門弟アプリと同じ |
| FIREBASE_PRIVATE_KEY | 門弟アプリと同じ |
| KS_APP_PASS_SECRET | 門弟アプリと同じ(通行証) |
| NEXT_PUBLIC_FIREBASE_API_KEY | 門弟アプリのFirebase設定の apiKey |
| R2_ACCOUNT_ID | CloudflareのアカウントID |
| R2_ACCESS_KEY_ID | R2のAPIトークン(アクセスキーID) |
| R2_SECRET_ACCESS_KEY | R2のAPIトークン(シークレット) |
| R2_BUCKET | singflex |

## R2のCORS設定(バケット singflex → 設定 → CORSポリシー)
```json
[{"AllowedOrigins":["https://singflex.ksvox.net"],"AllowedMethods":["GET","PUT"],"AllowedHeaders":["*"],"MaxAgeSeconds":3600}]
```

## データの置き場所
- 音源・ジャケット: Cloudflare R2(非公開バケット singflex、songs/<曲ID>/vocal.mp3・track.mp3・jacket.jpg)
- 歌詞・タイミング・コード・和訳: 門弟アプリのFirestore `singflex_songs`
- 歌詞メモ(英語歌唱メソッドの印): `singflex_songs` の memo(管理画面で分析・手直し)。発音辞書は `public/dict/en.txt`(CMU発音辞書+単語の使用頻度から作成、AIは不使用)
- 熟語・慣用句の一覧: 門弟アプリのFirestore `singflex_settings/main`(未保存の間は lib/client/idioms.js の初期一覧)
