import Head from 'next/head';
import { useEffect } from 'react';
import '../styles/globals.css';
import { applyScale, currentScale } from '../lib/client/fontScale';

export default function App({ Component, pageProps }) {
  useEffect(() => { applyScale(currentScale()); }, []);
  return (
    <>
      <Head>
        <title>SingFlex | K's VOX RECORD</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      </Head>
      <Component {...pageProps} />
    </>
  );
}
