# tree-sitter-hzml

Tree-sitter grammar for `.hzml` syntax highlighting. Parses block boundaries and uses language injection to delegate TypeScript highlighting to `<server>` blocks and HTML highlighting to `<template>` blocks.

## Neovim setup

### With nvim-treesitter

Add the parser config to your nvim-treesitter setup, pointing to your local clone:

```lua
local treesitter_parser_config = require("nvim-treesitter.parsers").get_parser_configs()

treesitter_parser_config.hzml = {
  install_info = {
    url = "/path/to/hzml/tree-sitter-hzml",
    files = {"src/parser.c", "src/scanner.c"},
    branch = "main",
  },
}

vim.treesitter.language.register("hzml", "hzml")
vim.filetype.add({ extension = { hzml = "hzml" } })
```

Then run `:TSInstall hzml`.

Copy the query files to your Neovim runtimepath:

```bash
mkdir -p ~/.local/share/nvim/site/queries/hzml
cp tree-sitter-hzml/queries/hzml/* ~/.local/share/nvim/site/queries/hzml/
```

> **Note:** The `url` must point to the `tree-sitter-hzml` directory directly — not the parent repo. Using the GitHub URL won't work because the grammar lives in a subdirectory, and nvim-treesitter can't resolve it during compilation.

### Manual setup

Requires [`tree-sitter-cli`](https://github.com/tree-sitter/tree-sitter/blob/master/cli/README.md) and a C compiler.

```bash
cd tree-sitter-hzml
tree-sitter generate
tree-sitter build --output parser/hzml.so
```

Copy the built parser and queries to your Neovim runtimepath:

```bash
mkdir -p ~/.local/share/nvim/site/parser
cp parser/hzml.so ~/.local/share/nvim/site/parser/

mkdir -p ~/.local/share/nvim/site/queries/hzml
cp queries/hzml/* ~/.local/share/nvim/site/queries/hzml/

mkdir -p ~/.config/nvim/ftdetect
cp ftdetect/hzml.lua ~/.config/nvim/ftdetect/
```

Add to your Neovim config:

```lua
vim.api.nvim_create_autocmd("FileType", {
  pattern = "hzml",
  callback = function(args)
    pcall(vim.treesitter.start, args.buf, "hzml")
  end,
})
```
