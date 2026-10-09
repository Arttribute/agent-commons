import { missingComputedArtifacts } from './computed-artifact-completion';
const request =
  'Fit regression using input.csv. Save regression.json and regression.png and return their Library links.';
const python = (artifacts: unknown[]) => ({
  name: 'runPythonAnalysis',
  status: 'success',
  result: { toolData: { exitCode: 0, artifacts } },
});
const files = [
  { name: 'regression.json', fileId: 'new-json' },
  { name: 'regression.png', fileId: 'new-plot' },
];
describe('computed artifact completion', () => {
  it('treats reused documents as inputs and accepts only real creative media publication', () => {
    const prompt = 'Save headline.png in the Library. Reload ad-copy.md and preserve brand-sheet.md.';
    const image = { name: 'generateImage', status: 'success', result: { toolData: [{ name: 'headline.png', fileId: 'fresh-image' }] } };
    expect(missingComputedArtifacts(prompt, [], [image])).toEqual([]);
    expect(missingComputedArtifacts(prompt, [], [{ ...image, status: 'error' }])).toEqual(['headline.png']);
    expect(missingComputedArtifacts(prompt, [], [{ name: 'generateMedia', status: 'success', result: { artifact: { itemId: 'fresh-image', name: 'headline.png' } } }])).toEqual([]);
    expect(missingComputedArtifacts(request, ['input.csv'], [{ ...image, result: { toolData: files } }])).toEqual(['regression.json', 'regression.png']);
  });
  it('rejects import-only execution and reading matching files from another chat as output creation', () => {
    expect(
      missingComputedArtifacts(
        request,
        ['input.csv'],
        [
          python([]),
          {
            name: 'readComputerFile',
            status: 'success',
            result: { path: '/old/regression.json', content: '{"slope":2}' },
          },
          {
            name: 'readUploadedFile',
            status: 'success',
            result: { artifacts: files },
          },
        ],
      ),
    ).toEqual(['regression.json', 'regression.png']);
  });
  it('requires every named requested output from verified current creation calls', () => {
    expect(
      missingComputedArtifacts(
        request,
        ['input.csv'],
        [python(files.slice(0, 1))],
      ),
    ).toEqual(['regression.png']);
    expect(
      missingComputedArtifacts(request, ['input.csv'], [python(files)]),
    ).toEqual([]);
  });
  it('does not accept failed calls, missing Library IDs or failed Python output', () => {
    for (const call of [
      { ...python(files), status: 'error' },
      python(files.map(({ name }) => ({ name }))),
      { ...python(files), result: { exitCode: 1, artifacts: files } },
    ])
      expect(missingComputedArtifacts(request, [], [call])).toEqual([
        'regression.json',
        'regression.png',
      ]);
  });
  it('excludes attached source files mentioned after an output verb', () => {
    expect(
      missingComputedArtifacts(
        'Create regression.png from input.csv and return the Library file.',
        ['input.csv'],
        [python([files[1]])],
      ),
    ).toEqual([]);
  });
  it('accepts a generated report following successful data work and unwraps JSON tool results', () => {
    expect(
      missingComputedArtifacts(
        'Analyse the CSV and export report.pdf as a Library artifact.',
        [],
        [
          python([]),
          {
            name: 'createPdfFile',
            status: 'success',
            result: JSON.stringify({
              data: { fileId: 'new-report', name: 'report.pdf' },
            }),
          },
        ],
      ),
    ).toEqual([]);
  });
  it('allows permission requests to wait for owner review', () => {
    expect(
      missingComputedArtifacts(
        request,
        [],
        [
          {
            name: 'requestComputerResources',
            status: 'success',
            result: { requiresConfirmation: true },
          },
        ],
      ),
    ).toEqual([]);
  });
  it('requires every text document explicitly requested in the Library', () => {
    expect(missingComputedArtifacts('Draft brand-sheet.md and ad-copy.md in the Library.', [], [
      { name: 'writeComputerFiles', status: 'success', result: { files: ['brand-sheet.md', 'ad-copy.md'] } },
    ])).toEqual(['brand-sheet.md', 'ad-copy.md']);
    expect(missingComputedArtifacts('Save poem.txt in the Library.', [], [
      { name: 'createTextFile', status: 'success', result: { fileId: 'poem', name: 'poem.txt' } },
    ])).toEqual([]);
  });
  it('requires cloud computation outputs without needing the word Library', () => {
    const prompt = 'Produce headline.png and offer.png with runPythonAnalysis, then save campaign-data.js and landing-page.html.';
    expect(missingComputedArtifacts(prompt, [], [python([])])).toEqual(['headline.png', 'offer.png', 'campaign-data.js', 'landing-page.html']);
    expect(missingComputedArtifacts(prompt, [], [], true)).toEqual([]);
  });
  it.each([
    'Extract the ZIP with Python. Read START HERE.md and report the workflow order. Do not create campaign outputs yet.',
    "Inspect the Library CSV with Python; don't generate charts or export files yet.",
    'Explain regression.',
    'Fit regression and show the slope in chat.',
    'Write a Python code example in chat about Library inputs.',
    'Explain how to save regression.png and use the Library later.',
  ])(
    'does not enforce output creation for informational requests: %s',
    (text) => {
      expect(missingComputedArtifacts(text, [], [])).toEqual([]);
    },
  );
});
