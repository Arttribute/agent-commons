import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { CodeProjectFileInput } from '../code-project/code-project.types';
export const CAMP_PUBLIC_CONTEXT =
  'AI Kids Hacker Camp. 9–11 December 2026 (Wednesday–Friday), 9:30 am–12:30 pm daily. Ages 7–13. NODE NBO, Gigiri, Nairobi. KSh 5,000 per child for all three mornings. Activities: comics & filmmaking (6–8 panel comic or a short film / trailer of about 30 seconds); games & simple apps, including interactive stories. Day 1 is shared; making paths start on Day 2. Children start on paper, make decisions, check results and explain their AI choices. Final-day family showcase planned, exact time unconfirmed. Capacity, equipment / food inclusions, payment route and cancellation terms must come from the organiser. Registration and required guardian choices use the organiser’s Google Forms. Do not request children’s personal information in chat. Do not invent availability, payment instructions, facilitator assignments or a booking confirmation.';
export function createPageFiles(
  template: string,
  config: { title: string; registrationUrl?: string },
): CodeProjectFileInput[] {
  if (template === 'ai-kids-camp') {
    const root = [
      join(__dirname, 'templates', 'assets'),
      join(process.cwd(), 'src/project-page/templates/assets'),
      join(process.cwd(), 'dist/project-page/templates/assets'),
      join(process.cwd(), 'dist/nest/project-page/templates/assets'),
    ].find((p) => existsSync(join(p, 'camp-page.tsx.source')));
    if (!root) throw new Error('Page starter assets are not installed');
    return [
      {
        path: 'app/page.tsx',
        content: readFileSync(join(root, 'camp-page.tsx.source'), 'utf8'),
      },
      {
        path: 'app/globals.css',
        content: readFileSync(join(root, 'camp.css'), 'utf8').replace(
          "'./assets/",
          "'../assets/",
        ),
      },
      {
        path: 'app/camp.config.json',
        content: JSON.stringify(
          {
            registrationUrl: config.registrationUrl ?? '',
            bookingContact: '',
            showcaseTime: '',
          },
          null,
          2,
        ),
      },
      ...['makers.png', 'node.png', 'inter.ttf', 'space.ttf'].map((name) => ({
        path: 'assets/' + name,
        content: 'base64:' + readFileSync(join(root, name)).toString('base64'),
      })),
    ];
  }
  return [
    {
      path: 'app/page.tsx',
      content: `import './globals.css';\nimport {openChat} from '@agent-commons/page';\nexport default function Page(){return <main><h1>{${JSON.stringify(config.title)}}</h1><p>Make this page your own. Edit the source here or import a built website from your preferred tool.</p><button onClick={()=>openChat().catch(e=>alert(e.message))}>Ask in Commons</button></main>}`,
    },
    {
      path: 'app/globals.css',
      content:
        'html,body,#root{margin:0;min-height:100%;font-family:system-ui,sans-serif}body{background:#faf8f2;color:#292524}main{max-width:860px;margin:auto;padding:80px 24px}h1{font-size:clamp(36px,6vw,64px);line-height:1.05}p{font-size:18px;line-height:1.7}button{padding:12px 18px;border:0;border-radius:8px;background:#292524;color:white;font:inherit;cursor:pointer}',
    },
  ];
}
