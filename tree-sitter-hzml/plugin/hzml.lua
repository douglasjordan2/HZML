vim.api.nvim_create_autocmd("FileType", {
  pattern = "hzml",
  callback = function(args)
    pcall(vim.treesitter.start, args.buf, "hzml")
  end,
})
