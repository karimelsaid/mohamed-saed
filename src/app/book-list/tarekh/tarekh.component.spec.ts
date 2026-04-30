import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TarekhComponent } from './tarekh.component';

describe('TarekhComponent', () => {
  let component: TarekhComponent;
  let fixture: ComponentFixture<TarekhComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [TarekhComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(TarekhComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
