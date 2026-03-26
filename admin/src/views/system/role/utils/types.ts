interface FormItemProps {
  id?: number;
  name: string;
  code: string;
  remark: string;
  status?: number;
}

interface FormProps {
  formInline: FormItemProps;
}

export type { FormItemProps, FormProps };
