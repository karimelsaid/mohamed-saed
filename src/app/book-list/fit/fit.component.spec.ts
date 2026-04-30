import { ComponentFixture, TestBed } from '@angular/core/testing';

import { FitComponent } from './fit.component';

describe('FitComponent', () => {
  let component: FitComponent;
  let fixture: ComponentFixture<FitComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [FitComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(FitComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
