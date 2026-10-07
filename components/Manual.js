// 取扱説明書(初回は自動で表示)
export default function Manual({ onClose }) {
  return (
    <div className="manual-back" onClick={onClose}>
      <div className="manual" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="取扱説明書">
        <div className="manual-head">
          <div><div className="manual-kicker">SingFlex</div><h2>取扱説明書</h2></div>
          <button className="manual-x" onClick={onClose} aria-label="閉じる">✕</button>
        </div>
        <div className="manual-body">
          <h3>このアプリでできること</h3>
          <p>K's VOX RECORDのオリジナル曲を、カラオケで練習できます。ボーカルと伴奏の音量を別々に変えられるので、歌を完全に消すことも、ガイドとして少しだけ残すこともできます。キー(上下6つまで)とテンポ(70〜110%)の変更、A–Bで区間の繰り返しもできます。</p>
          <h3>3つの部屋</h3>
          <p><b>コントロールルーム</b>で曲を選び、<b>ブース</b>で歌います。<b>控え室</b>では、英語歌唱メソッドの歌詞メモと和訳を確認できます。ブース上部の2つのドアで行き来します。</p>
          <h3>ネット接続について</h3>
          <p>ネットを使うのは「アプリを開く時」と「曲を初めて開く時」だけです。一度開いた曲はスマホに保存され、再生中は通信しません。<br />レッスンで使う曲は、<b>前日か当日に家のWi-Fiで一度開いておく</b>と、ギガを使わずスムーズに始められます。</p>
          <h3>Bluetoothスピーカーで流す時</h3>
          <p>Bluetoothは音が少し遅れて届きます。歌詞を見ながら歌う時は、ブースのミキサー内にある「Bluetoothスピーカー使用中」をオンにすると、歌詞の進みが音に合います。</p>
          <h3>ミキサーの開け閉め</h3>
          <p>ブース下のミキサーは、取っ手をタップするか、指で上下にスライドして開け閉めします。閉じると歌詞が大きく表示されます。</p>
        </div>
        <button className="manual-ok" onClick={onClose}>はじめる</button>
      </div>
    </div>
  );
}
