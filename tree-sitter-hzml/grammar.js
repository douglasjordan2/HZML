module.exports = grammar({
  name: "hzml",

  externals: $ => [
    $.server_content,
    $.loader_content,
    $.template_content,
  ],

  extras: $ => [/\s/],

  rules: {
    source_file: $ => seq(
      optional($.server_block),
      optional($.loader_block),
      optional($.template_block),
    ),

    server_block: $ => seq(
      "<server>",
      optional($.server_content),
      "</server>",
    ),

    loader_block: $ => seq(
      "<loader>",
      optional($.loader_content),
      "</loader>",
    ),

    template_block: $ => seq(
      "<template>",
      optional($.template_content),
      "</template>",
    ),
  },
});
