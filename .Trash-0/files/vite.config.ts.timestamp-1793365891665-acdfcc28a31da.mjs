import "node:module";
import { defineConfig } from "file:///home/wuxf/Develop/openlearn-manager/node_modules/.pnpm/vite@8.3.5_@types+node@26.6.6_jiti@2.7.0/node_modules/vite/dist/node/index.js";
import react from "file:///home/wuxf/Develop/openlearn-manager/node_modules/.pnpm/@vitejs+plugin-react@6.1.2_vite@8.3.5_@types+node@26.6.6_jiti@2.7.0_/node_modules/@vitejs/plugin-react/dist/index.js";
import tailwindcss from "file:///home/wuxf/Develop/openlearn-manager/node_modules/.pnpm/@tailwindcss+vite@4.3.3_vite@8.3.5_@types+node@26.6.6_jiti@2.7.0_/node_modules/@tailwindcss/vite/dist/index.mjs";
import path from "node:path";
import process from "node:process";
// vite.config.ts
const __vite_injected_original_dirname = "/home/wuxf/Develop/openlearn-manager-wt-startup";
const host = process.env.TAURI_DEV_HOST;
var vite_config_default = defineConfig(() => ({
	plugins: [react(), tailwindcss()],
	resolve: { alias: { "@": path.resolve(__vite_injected_original_dirname, "./src") } },
	clearScreen: false,
	server: {
		port: 1420,
		strictPort: true,
		host: host || false,
		hmr: host ? {
			protocol: "ws",
			host,
			port: 1421
		} : void 0,
		watch: { ignored: ["**/src-tauri/**"] }
	}
}));
export { vite_config_default as default };

//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidml0ZS5jb25maWcuanMiLCJuYW1lcyI6W10sInNvdXJjZXMiOlsiL2hvbWUvd3V4Zi9EZXZlbG9wL29wZW5sZWFybi1tYW5hZ2VyLXd0LXN0YXJ0dXAvdml0ZS5jb25maWcudHMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgZGVmaW5lQ29uZmlnIH0gZnJvbSBcInZpdGVcIjtcbmltcG9ydCByZWFjdCBmcm9tIFwiQHZpdGVqcy9wbHVnaW4tcmVhY3RcIjtcbmltcG9ydCB0YWlsd2luZGNzcyBmcm9tIFwiQHRhaWx3aW5kY3NzL3ZpdGVcIjtcbmltcG9ydCBwYXRoIGZyb20gXCJub2RlOnBhdGhcIjtcbmltcG9ydCBwcm9jZXNzIGZyb20gXCJub2RlOnByb2Nlc3NcIjtcblxuY29uc3QgaG9zdCA9IHByb2Nlc3MuZW52LlRBVVJJX0RFVl9IT1NUO1xuXG4vLyBodHRwczovL3ZpdGUuZGV2L2NvbmZpZy9cbmV4cG9ydCBkZWZhdWx0IGRlZmluZUNvbmZpZygoKSA9PiAoe1xuICBwbHVnaW5zOiBbcmVhY3QoKSwgdGFpbHdpbmRjc3MoKV0sXG4gIHJlc29sdmU6IHtcbiAgICBhbGlhczoge1xuICAgICAgXCJAXCI6IHBhdGgucmVzb2x2ZShpbXBvcnQubWV0YS5kaXJuYW1lLCBcIi4vc3JjXCIpLFxuICAgIH0sXG4gIH0sXG5cbiAgLy8gVml0ZSBvcHRpb25zIHRhaWxvcmVkIGZvciBUYXVyaSBkZXZlbG9wbWVudCBhbmQgb25seSBhcHBsaWVkIGluIGB0YXVyaSBkZXZgIG9yIGB0YXVyaSBidWlsZGBcbiAgLy9cbiAgLy8gMS4gcHJldmVudCBWaXRlIGZyb20gb2JzY3VyaW5nIHJ1c3QgZXJyb3JzXG4gIGNsZWFyU2NyZWVuOiBmYWxzZSxcbiAgLy8gMi4gdGF1cmkgZXhwZWN0cyBhIGZpeGVkIHBvcnQsIGZhaWwgaWYgdGhhdCBwb3J0IGlzIG5vdCBhdmFpbGFibGVcbiAgc2VydmVyOiB7XG4gICAgcG9ydDogMTQyMCxcbiAgICBzdHJpY3RQb3J0OiB0cnVlLFxuICAgIGhvc3Q6IGhvc3QgfHwgZmFsc2UsXG4gICAgaG1yOiBob3N0XG4gICAgICA/IHtcbiAgICAgICAgICBwcm90b2NvbDogXCJ3c1wiLFxuICAgICAgICAgIGhvc3QsXG4gICAgICAgICAgcG9ydDogMTQyMSxcbiAgICAgICAgfVxuICAgICAgOiB1bmRlZmluZWQsXG4gICAgd2F0Y2g6IHtcbiAgICAgIC8vIDMuIHRlbGwgVml0ZSB0byBpZ25vcmUgd2F0Y2hpbmcgYHNyYy10YXVyaWBcbiAgICAgIGlnbm9yZWQ6IFtcIioqL3NyYy10YXVyaS8qKlwiXSxcbiAgICB9LFxuICB9LFxufSkpO1xuIl0sIm1hcHBpbmdzIjoiOzs7Ozs7O0FBQUEsTUFBTSxtQ0FBbUM7QUFNekMsTUFBTSxPQUFPLFFBQVEsSUFBSTtBQUd6QixJQUFBLHNCQUFlLG9CQUFvQjtDQUNqQyxTQUFTLENBQUMsTUFBTSxHQUFHLFlBQVksQ0FBQztDQUNoQyxTQUFTLEVBQ1AsT0FBTyxFQUNMLEtBQUssS0FBSyxRQUFBLGtDQUE2QixPQUFPLEVBQ2hELEVBQ0Y7Q0FLQSxhQUFhO0NBRWIsUUFBUTtFQUNOLE1BQU07RUFDTixZQUFZO0VBQ1osTUFBTSxRQUFRO0VBQ2QsS0FBSyxPQUNEO0dBQ0UsVUFBVTtHQUNWO0dBQ0EsTUFBTTtFQUNSLElBQ0E7RUFDSixPQUFPLEVBRUwsU0FBUyxDQUFDLGlCQUFpQixFQUM3QjtDQUNGO0FBQ0YsRUFBRSJ9