# SheetJS CE 0.20.3

`xlsx-0.20.3.tgz` is the unmodified Node package downloaded from the [official SheetJS CDN](https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz). It is checked into the repository so production builds use the same reviewed bytes without depending on the CDN at install time. SHA-256: `8dc73fc3b00203e72d176e85b50938627c7b086e607c682e8d3c22c02bb99fe8`. The pnpm lockfile also pins its SHA-512 integrity.

The npm registry's last `xlsx` release is 0.18.5. SheetJS documents that 0.20.2 and later fix the [regular expression denial of service advisory](https://cdn.sheetjs.com/advisories/CVE-2024-22363), and its [prototype pollution advisory](https://cdn.sheetjs.com/advisories/CVE-2023-30533) was fixed in 0.19.3. The package contains its upstream `LICENSE` and `dist/LICENSE` files.
