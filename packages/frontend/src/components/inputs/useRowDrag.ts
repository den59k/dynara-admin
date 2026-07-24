import { ref, type Ref } from 'vue'

// Pointer-driven row reordering shared by the multi-value inputs
// (VSelectListInput rows, VInputTable rows). Pressing a row's handle starts a
// drag: the picked row follows the pointer along the Y axis (clamped to the
// list bounds), and the order updates live as the row crosses its neighbours.
//
// Wiring: `itemsRef` goes on the element whose children are exactly the
// draggable rows (nothing else — the row step is measured from them);
// `onHandleDown(index, $event)` on each row's handle; the row at `dragIndex`
// gets a `translateY(dragOffset px)` transform and a "dragging" style.
export const useRowDrag = (items: Ref<any[]>, onReorder: (next: any[]) => void) => {
  const itemsRef = ref<HTMLElement>()
  const dragIndex = ref<number | null>(null)
  // Pixel offset applied to the dragged row so it stays under the pointer.
  const dragOffset = ref(0)

  // Captured at the start of a drag and constant for its duration.
  let startIndex = 0
  let startPointerY = 0
  let rowStep = 0 // distance between consecutive row tops (height + gap)
  let rowCount = 0

  const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max)

  const onHandleDown = (index: number, e: PointerEvent) => {
    const container = itemsRef.value
    if (!container) return
    const rows = Array.from(container.children) as HTMLElement[]
    // Measure the step from the DOM so it tracks whatever height/gap the CSS uses.
    rowStep = rows.length > 1 ? rows[1].offsetTop - rows[0].offsetTop : 0
    if (rowStep === 0) return // a single row has nowhere to go

    e.preventDefault() // suppress native text/image selection while dragging
    startIndex = index
    rowCount = items.value.length
    startPointerY = e.clientY
    dragIndex.value = index
    dragOffset.value = 0

    // Listen on the window rather than the handle: reordering the rows moves the
    // handle's DOM node, which would drop pointer capture (and fire pointercancel)
    // and stall the drag. Window listeners fire wherever the pointer goes.
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', onPointerUp)
  }

  const onPointerMove = (e: PointerEvent) => {
    if (dragIndex.value == null) return
    const maxTop = (rowCount - 1) * rowStep
    // Where the row sits visually — derived from the original slot plus the total
    // pointer travel, so it's independent of the reorders done so far and can't drift.
    const visualTop = clamp(startIndex * rowStep + (e.clientY - startPointerY), 0, maxTop)
    const target = clamp(Math.round(visualTop / rowStep), 0, rowCount - 1)
    if (target !== dragIndex.value) {
      const arr = [...items.value]
      const [moved] = arr.splice(dragIndex.value, 1)
      arr.splice(target, 0, moved)
      dragIndex.value = target
      onReorder(arr)
    }
    // Offset relative to the row's (possibly new) home slot keeps it under the pointer.
    dragOffset.value = visualTop - dragIndex.value * rowStep
  }

  const onPointerUp = () => {
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', onPointerUp)
    window.removeEventListener('pointercancel', onPointerUp)
    dragIndex.value = null
    dragOffset.value = 0
  }

  return { itemsRef, dragIndex, dragOffset, onHandleDown }
}
