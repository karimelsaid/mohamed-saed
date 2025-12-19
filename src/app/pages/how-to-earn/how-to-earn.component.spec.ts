import { ComponentFixture, TestBed } from '@angular/core/testing';

import { HowToEarnComponent } from './how-to-earn.component';

describe('HowToEarnComponent', () => {
  let component: HowToEarnComponent;
  let fixture: ComponentFixture<HowToEarnComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [HowToEarnComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(HowToEarnComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
