import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AamalComponent } from './aamal.component';

describe('AamalComponent', () => {
  let component: AamalComponent;
  let fixture: ComponentFixture<AamalComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [AamalComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AamalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
