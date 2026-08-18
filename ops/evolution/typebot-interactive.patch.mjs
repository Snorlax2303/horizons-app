import fs from "node:fs";

const files = ["/evolution/dist/main.js", "/evolution/dist/main.mjs"];

const replacements = [
  {
    before: 'if(i){if(i.type==="choice input"){let l="",u=i.items;',
    after:
      'if(i){if(i.type==="choice input"&&!((i.items.length<=10&&i.items.every(l=>/^\\d+$/.test(String(l.content).trim())))||n.some(l=>l.type==="text"&&(l.content?.plainText?.includes("[buttons]")||l.content?.plainText?.includes("[list]"))))){let l="",u=i.items;',
    description: "Typebot interactive choice fallback",
  },
  {
    before:
      'listResponseMessage:c?.message?.listResponseMessage?.title||c?.listResponseMessage?.title,responseRowId:c?.message?.listResponseMessage?.singleSelectReply?.selectedRowId,',
    after:
      'responseRowId:c?.message?.listResponseMessage?.singleSelectReply?.selectedRowId,listResponseMessage:c?.message?.listResponseMessage?.title||c?.listResponseMessage?.title,',
    description: "list response row ID priority",
  },
];

for (const file of files) {
  let source = fs.readFileSync(file, "utf8");

  for (const replacement of replacements) {
    const originalOccurrences = source.split(replacement.before).length - 1;
    const patchedOccurrences = source.split(replacement.after).length - 1;

    if (originalOccurrences === 1 && patchedOccurrences === 0) {
      source = source.replace(replacement.before, replacement.after);
      continue;
    }

    if (originalOccurrences === 0 && patchedOccurrences === 1) continue;

    throw new Error(
      `${file}: expected one original or patched ${replacement.description} occurrence; ` +
        `found original=${originalOccurrences}, patched=${patchedOccurrences}`,
    );
  }

  fs.writeFileSync(file, source);
}
