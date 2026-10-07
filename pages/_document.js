import { Html, Head, Main, NextScript } from 'next/document';
export default function Doc() {
  return (
    <Html lang="ja">
      <Head>
        <meta name="robots" content="noindex, nofollow" />
        <meta name="theme-color" content="#15100c" />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link rel="icon" href="/favicon-32.png" sizes="32x32" type="image/png" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Unbounded:wght@500;700&family=Zen+Kaku+Gothic+New:wght@400;700&family=JetBrains+Mono:wght@500&family=Yellowtail&family=Kalam:wght@400;700&family=Yomogi&display=swap" rel="stylesheet" />
      </Head>
      <body><Main /><NextScript /></body>
    </Html>
  );
}
