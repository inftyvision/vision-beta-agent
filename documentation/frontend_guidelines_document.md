---
description: Apply these rules when making changes to the project
globs:
alwaysApply: true
---

Update this rule if user requested changes to the project requirement, etc.
# Frontend Guideline Document

This document outlines our front-end architecture, design principles, and technologies for a modular, scalable multi-agent platform. The goal is to build a plug-and-play system that supports AI-driven decision making, prompt engineering, and a variety of creative utilities. All components are designed to be intuitive and flexible, so even non-technical users can quickly adapt to the system.

## 1. Frontend Architecture

**Overview:**

Our frontend is built on a modern stack consisting of Next.js, React, and Tailwind CSS. These choices provide server-side rendering, dynamic component-based interactions, and rapid styling capabilities. The system is crafted to be modular and maintainable, ensuring that each agent (or mini app) can be independently developed and integrated.

**Key Technologies & Frameworks:**

*   **Next.js:** A robust framework that not only handles routing and server-side rendering but also ensures rapid performance.
*   **React:** The core library for building dynamic, responsive components. Its component-based structure supports code reuse and isolated testing.
*   **Tailwind CSS:** A utility-first CSS framework that speeds up styling while maintaining consistency in design across the entire application.

**Scalability, Maintainability, and Performance:**

*   **Scalability:** The modular nature allows you to add or replace agents quickly, supporting horizontal scaling by integrating new functionalities as independent modules.
*   **Maintainability:** Clear separation of components, state management, and routing ensures that code updates or feature enhancements have minimal impact on other parts of the system.
*   **Performance:** Leveraging Next.js for code splitting and pre-rendering, combined with lazy loading and efficient asset management, ensures a fast and smooth user experience.

## 2. Design Principles

Our design is driven by three key principles:

*   **Usability:** Interfaces are clean, intuitive, and easy to navigate. The dashboard and agent interaction screens are designed to reduce the learning curve and let you quickly find and use the right tools.
*   **Accessibility:** We follow standard accessibility guidelines to ensure that our application is usable by as many people as possible, including proper contrast ratios, semantic HTML, and keyboard navigation.
*   **Responsiveness:** The design adapts seamlessly to different devices and screen sizes, ensuring an optimal experience on desktops, tablets, and mobile phones.

These principles guide every decision in layout, interaction, and visual presentation—helping to build a user-friendly experience.

## 3. Styling and Theming

**Styling Approach:**

*   We use Tailwind CSS, which provides a utility-first approach for rapid and uniform styling. This supports consistent design across all components.
*   Our CSS naming conventions are kept simple and component-specific, often following a modified BEM approach to avoid conflicts in larger projects.

**Design Style:**

*   **Visual Style:** The design leans towards a modern flat aesthetic with hints of minimalism. We may incorporate elements of glassmorphism in UI cards and panels for a contemporary look, but the overall footprint remains clean and flat.

*   **Color Palette:**

    *   Primary: #0070f3 (vibrant blue for action elements)
    *   Secondary: #1c1c1e (dark for text and major backgrounds)
    *   Accent: #e2e8f0 (light gray for highlights and borders)
    *   Background: #ffffff (white for a clean look)
    *   Success/Alert colors can be added as needed to distinguish different notifications.

**Typography:**

*   **Font:** We recommend using the 'Inter' font, which is modern, highly legible, and widely supported. This choice complements the clean, flat design style.

**Theming:**

*   Consistency is ensured across the application by defining global theme settings in Tailwind’s configuration. This includes spacing, colors, typography, and component-specific styles to maintain a coherent look and feel.

## 4. Component Structure

**Structure and Organization:**

*   Components are built in a modular, reusable manner, sorted by functionality. Each agent or mini app is encapsulated so that it can be plugged in or replaced without affecting the overall system.
*   The directory structure is organized by feature, with shared components (like buttons, input fields, and form elements) residing in a common components folder.

**Benefits:**

*   **Reusability:** Components are written once and used in multiple places, reducing duplication and errors.
*   **Maintainability:** A well-defined component structure makes tracking down bugs and updating features easier.
*   **Scalability:** New components can be added or existing ones replaced following a set pattern without reorganizing large parts of the codebase.

## 5. State Management

**Approach:**

*   Depending on the complexity of the component interactions, we adopt a mix of local component state and simplified global state management using React’s Context API. For more complex interactions, libraries like Redux may be considered.

**How It Works:**

*   **Local State:** Managed within components for small-scale interactions.
*   **Global State:** Shared across components to support communication between independent agents. This is particularly useful in our plug-and-play model where agents need to interact in a coordinated manner.

Maintaining a clear and predictable state helps ensure that user actions result in consistent and expected outputs, especially when handling asynchronous processes and decision trees.

## 6. Routing and Navigation

**Routing Framework:**

*   We use Next.js’s built-in routing system, which automatically maps files in the pages directory to routes within the application.

**Navigation Structure:**

*   **Dashboard:** Acts as the main entry point, offering a clean overview of available agents and navigation options.
*   **Agent Selector:** Lets users choose between different AI-driven agents, each shown as a modular card or list item.
*   **Detail & Interaction Pages:** Once an agent is selected, the interface dynamically loads the relevant interaction module, with context-aware routing handling sub-commands and asynchronous processes.

This approach makes it easy for users to move seamlessly between different parts of the application while ensuring a consistent navigation experience.

## 7. Performance Optimization

**Strategies:**

*   **Lazy Loading & Code Splitting:** Next.js automatically splits code for faster initial load times. Components and modules that aren't immediately needed are loaded on-demand.
*   **Asset Optimization:** Tailwind CSS and image optimizations ensure that styles and media are delivered efficiently.
*   **Asynchronous Handling:** Our decision-tree based command routing system is optimized to handle multiple asynchronous processes without blocking the main user interface.

**Impact:**

*   These measures not only enhance the user experience by keeping the interface snappy and responsive, but they also contribute to more efficient resource use, which is important as new agents and functionalities are integrated.

## 8. Testing and Quality Assurance

**Testing Strategies:**

*   **Unit Testing:** Each component is tested individually using frameworks such as Jest and React Testing Library.
*   **Integration Testing:** Ensures that different components and modules work together correctly. This includes testing how state management and routing handle multiple scenarios.
*   **End-to-End Testing:** Tools like Cypress are used to simulate real user interactions, ensuring that navigation, form submissions, and asynchronous processes perform as expected.

**Quality Assurance Tools:**

*   Our CI/CD pipeline integrates automated testing, ensuring that updates are continuously validated before deployment. This not only catches errors early but also maintains the reliability of the prototype as it scales.

## 9. Conclusion and Overall Frontend Summary

This frontend guideline document has outlined the architecture, design principles, and technologies chosen to develop our modular plug-and-play multi-agent platform. The use of Next.js, React, and Tailwind CSS ensures a scalable, maintainable, and high-performing application.

Key aspects include:

*   A modular and component-based design that facilitates easy addition or replacement of agents.
*   A clear design approach emphasizing usability, accessibility, and responsiveness.
*   A consistent styling and theming strategy that leverages modern design cues (flat and minimal with subtle hints of glassmorphism) and a coherent color palette.
*   Robust state management and efficient routing systems aligned with the application’s asynchronous, decision-tree-based command parsing model.
*   Performance optimizations that ensure fast load times and smooth interaction, even as the system scales.
*   A comprehensive testing strategy covering unit, integration, and end-to-end testing to ensure overall quality and reliability.

This setup uniquely positions the project to evolve quickly with new agent implementations while maintaining an excellent user experience for both developers and end-users. The guidelines provided here serve as the blueprint for current development and future scalability.
