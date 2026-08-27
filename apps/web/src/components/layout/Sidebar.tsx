import { NavLink } from 'react-router-dom';
import { Sliders, Grid, Users, type Icon } from 'react-feather';

interface NavItem {
  to: string;
  label: string;
  icon: Icon;
}

interface NavSection {
  header: string;
  items: NavItem[];
}

const SECTIONS: NavSection[] = [
  {
    header: 'Proyectos del equipo',
    items: [
      { to: '/all-projects', label: 'Todos los proyectos', icon: Grid },
      { to: '/', label: 'Resumen por proyecto', icon: Sliders },
    ],
  },
  {
    header: 'Keytia',
    items: [{ to: '/keytia', label: 'User Stories por Cliente', icon: Users }],
  },
];

interface SidebarProps {
  collapsed: boolean;
}

export function Sidebar({ collapsed }: SidebarProps) {
  return (
    <nav id="sidebar" className={`sidebar js-sidebar${collapsed ? ' collapsed' : ''}`}>
      <div className="sidebar-content">
        <NavLink className="sidebar-brand" to="/">
          <span className="align-middle">DevSquad Stats</span>
        </NavLink>

        <ul className="sidebar-nav">
          {SECTIONS.map((section) => (
            <li className="sidebar-section" key={section.header}>
              <ul className="sidebar-nav p-0">
                <li className="sidebar-header">{section.header}</li>
                {section.items.map(({ to, label, icon: IconCmp }) => (
                  <li className="sidebar-item" key={to}>
                    <NavLink
                      to={to}
                      end={to === '/'}
                      className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}
                    >
                      <IconCmp className="align-middle" size={18} />{' '}
                      <span className="align-middle">{label}</span>
                    </NavLink>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}
