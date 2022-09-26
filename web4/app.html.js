export default /*html*/ `
<div id="content">
    <h1>Play music posted by someone</h1>
    <p>
        <p>account:<br /><input type="text" id="accountidinput" /></p>
        <p>parameters (JSON):<br /><textarea id="paramstextarea">{"bpm": 90}</textarea></p>
        <button id="loadmusicbutton">load music</button>
        <audio-player></audio-player>
    </p>
    <p id="statusspan"></p>

    <hr width="100%" />
    <h1>Post music</h1>
    <p>Paste Javascript code below</p>
    <p><textarea id="musicscriptextarea"></textarea></p>
    <p><input type="checkbox" id="compilesongcheckbox" checked/> wrap in song compiler (if pasting code directly from WebAssembly music app)</p>
    <button id="submitmusicbutton">submit</button>
</div>
`;