// Клавиатура, мышь и сенсорное управление (виртуальный джойстик)
class Input {
  constructor() {
    this.keys = new Set();
    this.pressedSet = new Set();
    this.mouse = { x: 0, y: 0, down: false, right: false, moved: false };
    this.touch = { active: false, id: null, sx: 0, sy: 0, x: 0, y: 0, dx: 0, dy: 0 };
    this.isTouch = false;
    this.abilityTouch = false;
  }

  attach(canvas) {
    window.addEventListener('keydown', (e) => {
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
      if (!this.keys.has(e.code)) this.pressedSet.add(e.code);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.mouse.down = this.mouse.right = false;
    });
    window.addEventListener('mousemove', (e) => {
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
      this.mouse.moved = true;
    });
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) this.mouse.down = true;
      if (e.button === 2) {
        this.mouse.right = true;
        this.pressedSet.add('Mouse2');
      }
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouse.down = false;
      if (e.button === 2) this.mouse.right = false;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    // Сенсорный ввод: левая половина экрана — джойстик
    canvas.addEventListener(
      'touchstart',
      (e) => {
        this.isTouch = true;
        document.body.classList.add('touch');
        for (const t of e.changedTouches) {
          if (!this.touch.active) {
            this.touch.active = true;
            this.touch.id = t.identifier;
            this.touch.sx = this.touch.x = t.clientX;
            this.touch.sy = this.touch.y = t.clientY;
            this.touch.dx = this.touch.dy = 0;
          }
        }
        e.preventDefault();
      },
      { passive: false }
    );
    canvas.addEventListener(
      'touchmove',
      (e) => {
        for (const t of e.changedTouches) {
          if (t.identifier === this.touch.id) {
            this.touch.x = t.clientX;
            this.touch.y = t.clientY;
            let dx = t.clientX - this.touch.sx, dy = t.clientY - this.touch.sy;
            const len = Math.hypot(dx, dy);
            const max = 60;
            if (len > max) {
              // джойстик «следует» за пальцем
              this.touch.sx += (dx / len) * (len - max);
              this.touch.sy += (dy / len) * (len - max);
              dx = t.clientX - this.touch.sx;
              dy = t.clientY - this.touch.sy;
            }
            this.touch.dx = dx / max;
            this.touch.dy = dy / max;
          }
        }
        e.preventDefault();
      },
      { passive: false }
    );
    const end = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this.touch.id) {
          this.touch.active = false;
          this.touch.id = null;
          this.touch.dx = this.touch.dy = 0;
        }
      }
    };
    canvas.addEventListener('touchend', end);
    canvas.addEventListener('touchcancel', end);
  }

  down(...codes) {
    for (const c of codes) if (this.keys.has(c)) return true;
    return false;
  }

  pressed(...codes) {
    for (const c of codes) if (this.pressedSet.has(c)) return true;
    return false;
  }

  endFrame() {
    this.pressedSet.clear();
  }

  moveVector() {
    let x = 0, y = 0;
    if (this.down('KeyA', 'ArrowLeft')) x -= 1;
    if (this.down('KeyD', 'ArrowRight')) x += 1;
    if (this.down('KeyW', 'ArrowUp')) y -= 1;
    if (this.down('KeyS', 'ArrowDown')) y += 1;
    if (this.touch.active) {
      x = this.touch.dx;
      y = this.touch.dy;
      const l = Math.hypot(x, y);
      if (l > 1) {
        x /= l;
        y /= l;
      }
      return { x, y };
    }
    const l = Math.hypot(x, y);
    if (l > 0) {
      x /= l;
      y /= l;
    }
    return { x, y };
  }
}

export const input = new Input();
