import { startVideoRecording, stopVideoRecording } from '//cdn.jsdelivr.net/npm/wasm-music@0.0.25/screenrecorder/screenrecorder.js';
import { marked } from '//cdn.jsdelivr.net/npm/marked@4.0.16/lib/marked.esm.js';
import hljs from '//cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.5.1/build/es/highlight.min.js';

const iframeUrls = [];

function nextSlide() {
    const slides = [...document.querySelectorAll('.slide')];
    let currentSlideIndex = slides.findIndex(slide => slide.classList.contains('slideinleft')
            || slide.classList.contains('slideinright'));
    slides[currentSlideIndex].classList.remove('slideinleft');
    slides[currentSlideIndex].classList.remove('slideinright');
    slides[currentSlideIndex].classList.add('slideoutleft');
    let currentIframe = slides[currentSlideIndex].querySelector('iframe');
    if (currentIframe) {
        currentIframe.src = '';
    }
    currentSlideIndex = (currentSlideIndex + 1) % slides.length;
    slides[currentSlideIndex].classList.remove('slideoutleft');
    slides[currentSlideIndex].classList.remove('slideoutright');            
    slides[currentSlideIndex].classList.add('slideinleft');
    location.hash = '' + (currentSlideIndex+1);
    currentIframe = slides[currentSlideIndex].querySelector('iframe');
    if (currentIframe) {
        currentIframe.src = iframeUrls[currentSlideIndex];
    }
}

function previousSlide() {
    const slides = [...document.querySelectorAll('.slide')];
    let currentSlideIndex = slides.findIndex(slide => slide.classList.contains('slideinleft')
            || slide.classList.contains('slideinright'));
    slides[currentSlideIndex].classList.remove('slideinleft');
    slides[currentSlideIndex].classList.remove('slideinright');
    slides[currentSlideIndex].classList.add('slideoutright');
    let currentIframe = slides[currentSlideIndex].querySelector('iframe');
    if (currentIframe) {
        currentIframe.src = '';
    }
    currentSlideIndex = (currentSlideIndex - 1);
    if (currentSlideIndex < 0) {
        currentSlideIndex = slides.length -1;
    }
    slides[currentSlideIndex].classList.remove('slideoutleft');
    slides[currentSlideIndex].classList.remove('slideoutright');            
    slides[currentSlideIndex].classList.add('slideinright'); 
    location.hash = '' + (currentSlideIndex+1);
    currentIframe = slides[currentSlideIndex].querySelector('iframe');
    if (currentIframe) {
        currentIframe.src = iframeUrls[currentSlideIndex];
    }
}

let carouselactive = true;
function carousel() {
    setTimeout(() => {
        if (carouselactive) {
            nextSlide();
        }
        carousel();
    }, 10000);
}
let audioContext = new AudioContext();
let recording = false;
document.addEventListener('keyup', async (k) => {        
    if( k.code === 'ArrowRight') {
        nextSlide();
    } else if(k.code === 'ArrowLeft') {
        previousSlide();
    } else if(k.code === 'KeyF') {
        document.documentElement.requestFullscreen();
        document.exitFullscreen();
    } else if(k.code === 'KeyP') {
        carouselactive = !carouselactive;                
    }
    if (k.ctrlKey && k.code === 'KeyR') {
        if (!recording) {
            recording = true;
            await startVideoRecording(audioContext);

        } else {
            recording = false;
            await stopVideoRecording();
        }
    }
});


(async function() {
    marked.setOptions({
        renderer: new marked.Renderer(),
        highlight: function(code, lang) {
          const language = hljs.getLanguage(lang) ? lang : 'plaintext';
          console.log(lang);
          return hljs.highlight(code, { language }).value;
        },
        langPrefix: 'hljs language-', // highlight.js css expects a top-level 'hljs' class.
        pedantic: false,
        gfm: true,
        breaks: false,
        sanitize: false,
        smartLists: true,
        smartypants: false,
        xhtml: false
    });
      
    const slidesmarkdown = await fetch(`slides.md?t=${new Date().getTime()}`).then(r => r.text());
    let slides = slidesmarkdown.split(/\n------\r*\n/);

    await Promise.all(slides.map(async (txt, slidendx) => {
        const slidesdiv = document.createElement('div');
        slidesdiv.classList.add('slide');
        slidesdiv.innerHTML = `<div class="marked">${marked.parse(txt)}</div>`;
        const iframe = slidesdiv.querySelector('iframe');
        if (iframe) {
            iframeUrls[slidendx] = iframe.src 
            iframe.src = '';
            iframe.allow = `midi *`;
        }
        document.body.appendChild(slidesdiv);              
    }));

    [...document.querySelectorAll('a')].forEach(linkElement => {
        linkElement.target = '_blank';
    });
    [...document.querySelectorAll('code')].forEach(codeElement => {
        let button = document.createElement("button");
        button.classList.add('copycodebutton');
        button.innerHTML = '&#x2398 copy';
        button.addEventListener("click", () => {
            navigator.clipboard.writeText(codeElement.innerText);
        });
        codeElement.parentElement.appendChild(button);
    });
    slides = [...document.querySelectorAll('.slide')];
    const slideFromUrlHash = location.hash.match(/([0-9]+)/);
    const currentSlideIndex = slideFromUrlHash ? parseInt(slideFromUrlHash[1]) -1 : 0;
    const currentIframe = slides[currentSlideIndex].querySelector('iframe');
    if (currentIframe) {
        currentIframe.src = iframeUrls[currentSlideIndex];
    }
    slides[currentSlideIndex].classList.add('slideinleft');
    // carousel();    

    /*setInterval(() => {
        const timeIndicator = document.querySelector('#timeindicator');
        const now = new Date();
        
        timeIndicator.innerHTML = `${now.toLocaleTimeString()}`;
      }, 1000);*/
})();