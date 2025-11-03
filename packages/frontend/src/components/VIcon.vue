<script lang="ts">
// @ts-ignore
import { h, type HTMLAttributes } from 'vue';
// @ts-ignore
import { contents, attrs } from '../assets/icons?svg-glob'

export default (props: { icon: string } & HTMLAttributes) => {
  return h("svg", { ...attrs[props.icon], innerHTML: contents[props.icon] })
}

</script>