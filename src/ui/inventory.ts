import { BLOCK_COLORS } from '../engine/blocks'
import type { InventorySlot } from '../god/GodMode'

const toCSS = (r: number, g: number, b: number): string =>
  `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`

export class InventoryUI {
  private readonly bar: HTMLElement
  private readonly slotEls: HTMLElement[]
  private readonly iconEls: HTMLElement[]
  private readonly countEls: HTMLElement[]

  constructor() {
    this.bar = document.getElementById('inventory')!
    this.slotEls = []
    this.iconEls = []
    this.countEls = []

    for (let i = 0; i < 10; i++) {
      const slot = document.createElement('div')
      slot.className = 'inv-slot'

      const icon = document.createElement('div')
      icon.className = 'inv-icon'

      const count = document.createElement('div')
      count.className = 'inv-count'

      slot.appendChild(icon)
      slot.appendChild(count)
      this.bar.appendChild(slot)
      this.slotEls.push(slot)
      this.iconEls.push(icon)
      this.countEls.push(count)
    }
  }

  setVisible(visible: boolean): void {
    this.bar.classList.toggle('hidden', !visible)
  }

  refresh(slots: (InventorySlot | null)[], activeSlot: number): void {
    for (let i = 0; i < 10; i++) {
      const slot = slots[i]
      this.slotEls[i].classList.toggle('active', i === activeSlot)

      if (slot) {
        const c = BLOCK_COLORS[slot.blockId]
        this.iconEls[i].style.background = toCSS(...c.top)
        this.iconEls[i].style.boxShadow =
          `inset 0 -3px 0 ${toCSS(c.bottom[0] * 0.7, c.bottom[1] * 0.7, c.bottom[2] * 0.7)}`
        this.iconEls[i].style.display = 'block'
        this.countEls[i].textContent = String(slot.count)
      } else {
        this.iconEls[i].style.display = 'none'
        this.countEls[i].textContent = ''
      }
    }
  }
}
