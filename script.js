const rgdMouse = document.getElementById("RGD-Logo");
let hovering = false;

rgdMouse.addEventListener("mouseover", function () {
  hovering = true;
  for (let i = 0; i < 141; i++) {
    let size = 20 + i;
    setTimeout(() => {
      if (!hovering) return;
      rgdMouse.style.width = size + "px";
      rgdMouse.style.height = size + "px";
    }, i * 4);
  }
});

rgdMouse.addEventListener("mouseout", function () {
  hovering = false;
  for (let i = 0; i < 141; i++) {
    let size = 160 - i;
    setTimeout(() => {
      if (hovering) return; // ✅ flipped — stops shrinking if mouse came back
      rgdMouse.style.width = size + "px";
      rgdMouse.style.height = size + "px";
    }, i * 4);
  }
});