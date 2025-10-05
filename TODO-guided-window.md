# TODO: Guided Window (Tutorial/Walkthrough) Feature

## Overview
Add a guided window feature for new users that introduces key app features with next, previous, and skip options.

## Main Components and Pages Identified
- **HomePageComponent**: Main landing page with categories, recent books, promo carousel
- **Book Category Components**: Islamic, Tatwer, Rewayat, Aamal, Fit, Qamos, Child, Tarekh, Fenon
- **SearchResultsComponent**: Search functionality
- **CartComponent**: Shopping cart
- **FavoritesComponent**: User favorites
- **Auth Components**: Login, Register, Password reset
- **Merchant/Admin Dashboards**: Management interfaces
- **BookDetailsComponent**: Individual book pages
- **UserOrdersComponent**: Order management
- **PrintComponent**: Print services

## Implementation Steps

### 1. Create Tutorial Service
- [ ] Create `src/app/services/tutorial.service.ts`
- [ ] Handle tutorial state management
- [ ] Check if user is new (localStorage)
- [ ] Define tutorial steps configuration
- [ ] Methods for navigation (next, previous, skip)

### 2. Create Tutorial Component
- [ ] Create `src/app/shared/tutorial/tutorial.component.ts`
- [ ] Create `src/app/shared/tutorial/tutorial.component.html`
- [ ] Create `src/app/shared/tutorial/tutorial.component.css`
- [ ] Implement step navigation UI
- [ ] Integrate with modal service for overlay

### 3. Define Tutorial Steps
- [ ] Step 1: Welcome and app overview
- [ ] Step 2: Book categories navigation
- [ ] Step 3: Search functionality
- [ ] Step 4: Cart and favorites
- [ ] Step 5: User account features
- [ ] Step 6: Getting started actions

### 4. Integrate with App Component
- [ ] Update `src/app/app.component.ts` to check for tutorial on init
- [ ] Add tutorial component to app template
- [ ] Handle tutorial visibility state

### 5. Add Highlighting System
- [ ] Implement element highlighting for tutorial steps
- [ ] Position tutorial overlay correctly
- [ ] Smooth transitions between steps

### 6. User Preferences
- [ ] Store "don't show again" preference in localStorage
- [ ] Allow users to restart tutorial from settings

### 7. Responsive Design
- [ ] Ensure tutorial works on mobile and desktop
- [ ] Adjust positioning and text for different screen sizes

### 8. Testing and Polish
- [ ] Test tutorial flow on different pages
- [ ] Add animations and smooth transitions
- [ ] Handle edge cases (user navigation during tutorial)
