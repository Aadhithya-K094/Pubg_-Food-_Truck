import React, { useMemo } from "react";

import MenuItem from "./MenuItem";
import { IconFork } from "./Icons";

/**
 * Groups menu items by category and renders a responsive grid.
 * Shows an empty-state message when there are no items yet
 * (the admin will add real menus + images later).
 */
export default function MenuGrid({ menu, cart, onQty }) {
  const grouped = useMemo(() => {
    const groups = {};
    for (const item of menu) {
      const cat = item.category || "Menu";
      (groups[cat] = groups[cat] || []).push(item);
    }
    return groups;
  }, [menu]);

  if (!menu.length) {
    return (
      <div className="menu-empty">
        <span className="menu-empty-icon"><IconFork /></span>
        <p>No menu items yet.</p>
        <p className="cust-muted">Items and images will appear here once added.</p>
      </div>
    );
  }

  return (
    <div className="menu-groups">
      {Object.entries(grouped).map(([category, items]) => (
        <section key={category} className="menu-group">
          <h2 className="menu-group-title">{category}</h2>
          <div className="menu-grid">
            {items.map((item) => (
              <MenuItem
                key={item.id}
                item={item}
                qty={cart[item.id] || 0}
                onQty={onQty}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
